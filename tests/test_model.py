import copy
import json
from pathlib import Path
import tempfile
import unittest
from velkatalous.ledger import Ledger, Rejected
from velkatalous.simulation import run
from velkatalous.physical import Physical


class AccountingTests(unittest.TestCase):
    def setUp(self):
        self.b = Ledger()
        self.b.add('a', 100, goods={'wood': 10})
        self.b.add('b', 100)
        self.b.add('c', 100)

    def assert_balanced(self, book):
        book.check()
        self.assertEqual(sum(a.balance for a in book.agents.values()) + book.community_balance, 0)

    def test_first_trade_is_immediate_from_zero(self):
        self.b.trade('a', 'b', 'wood', 1, 10, consent=True)
        self.assertEqual((self.b.agents['a'].balance, self.b.agents['b'].balance), (-10, 10))
        self.assertEqual((self.b.agents['a'].goods['wood'], self.b.agents['b'].goods['wood']), (9, 1))
        self.assertEqual(self.b.volume, 10)
        self.assert_balanced(self.b)

    def test_negative_seller_can_keep_selling(self):
        self.b.trade('a', 'b', 'wood', 1, 10, consent=True)
        self.b.trade('a', 'c', 'wood', 1, 20, consent=True)
        self.assertEqual([a.balance for a in self.b.agents.values()], [-30, 10, 20])
        self.assert_balanced(self.b)

    def test_round_trip_negative_recipient_has_headroom(self):
        self.b.trade('a', 'b', 'wood', 1, 10, consent=True)
        self.b.agents['a'].limit = 0
        self.b.trade('b', 'a', 'wood', 1, 10, consent=True)
        self.assertEqual([a.balance for a in self.b.agents.values()], [0, 0, 0])
        self.assertEqual(self.b.agents['a'].goods['wood'], 10)
        self.assertEqual(self.b.volume, 20)
        before = copy.deepcopy(self.b.__dict__)
        with self.assertRaises(Rejected):
            self.b.transfer('b', 'a', 1, consent=True)
        self.assertEqual(before, self.b.__dict__)

    def test_multi_stage_goods_and_position_chain(self):
        self.b.trade('a', 'b', 'wood', 1, 10, consent=True)
        self.b.trade('b', 'c', 'wood', 1, 7, consent=True)
        self.assertEqual([a.balance for a in self.b.agents.values()], [-10, 3, 7])
        self.assertEqual(self.b.agents['c'].goods['wood'], 1)
        self.assert_balanced(self.b)

    def test_recipient_limit_and_rejection_are_atomic(self):
        self.b.agents['b'].limit = 10
        self.b.trade('a', 'b', 'wood', 1, 10, consent=True)
        before = copy.deepcopy(self.b.__dict__)
        with self.assertRaises(Rejected):
            self.b.trade('a', 'b', 'wood', 1, 1, consent=True)
        self.assertEqual(before, self.b.__dict__)

    def test_limit_reduction_preserves_positions_and_allows_selling(self):
        self.b.trade('a', 'b', 'wood', 2, 10, consent=True)
        self.b.agents['b'].limit = 5
        self.b.check()
        self.assertEqual(self.b.agents['b'].balance, 10)
        with self.assertRaises(Rejected):
            self.b.transfer('a', 'b', 1, consent=True)
        self.b.trade('b', 'c', 'wood', 1, 6, consent=True)
        self.assertEqual(self.b.agents['b'].balance, 4)
        self.assert_balanced(self.b)

    def test_free_gift_to_over_limit_recipient(self):
        self.b.trade('a', 'b', 'wood', 1, 10, consent=True)
        self.b.agents['b'].limit = 5
        self.b.trade('a', 'b', 'wood', 1, 0, consent=True)
        self.assertEqual(self.b.agents['b'].goods['wood'], 2)
        self.assertEqual((self.b.agents['b'].balance, self.b.volume), (10, 10))
        self.assert_balanced(self.b)

    def test_invalid_trades_leave_everything_unchanged(self):
        cases = [
            ('a', 'b', 'wood', 0, 10, True),
            ('a', 'b', 'wood', 11, 10, True),
            ('a', 'b', 'wood', 1, -1, True),
            ('a', 'b', 'wood', -1, 1, True),
            ('a', 'b', 'wood', 1, 1.5, True),
            ('a', 'b', 'wood', 1, True, True),
            ('a', 'b', 'wood', True, 1, True),
            ('a', 'b', 'wood', 1, 1, False),
            ('a', 'b', 'wood', 1, 1, 'yes'),
            ('a', 'a', 'wood', 1, 1, True),
            ('a', 'unknown', 'wood', 1, 1, True),
        ]
        for args in cases:
            with self.subTest(args=args):
                before = copy.deepcopy(self.b.__dict__)
                with self.assertRaises(Rejected):
                    self.b.trade(*args)
                self.assertEqual(before, self.b.__dict__)

    def test_invalid_transfers_are_atomic(self):
        for args in [('a', 'b', -1, True), ('a', 'b', 101, True),
                     ('a', 'a', 1, True), ('a', 'b', 1, False)]:
            with self.subTest(args=args):
                before = copy.deepcopy(self.b.__dict__)
                with self.assertRaises(Rejected):
                    self.b.transfer(*args)
                self.assertEqual(before, self.b.__dict__)

    def test_arbitrary_integer_positions_need_no_historical_constant(self):
        amount = 10 ** 100
        self.b.agents['b'].limit = amount
        self.b.transfer('a', 'b', amount, consent=True)
        self.assertEqual(self.b.agents['a'].balance, -amount)
        self.assertEqual(self.b.agents['b'].balance, amount)
        self.assert_balanced(self.b)

    def test_death_moves_each_sign_to_community_and_birth_is_zero(self):
        self.b.trade('a', 'b', 'wood', 1, 10, consent=True)
        for name, expected in [('a', -10), ('b', 10), ('c', 0)]:
            with self.subTest(name=name):
                book = copy.deepcopy(self.b)
                book.death(name)
                self.assertEqual(book.community_balance, expected)
                self.assertEqual(book.agents[name].balance, 0)
                self.assertFalse(book.agents[name].alive)
                self.assertEqual(dict(book.agents[name].goods), {})
                book.add('newborn', 0)
                self.assertEqual(book.agents['newborn'].balance, 0)
                self.assert_balanced(book)
                before = copy.deepcopy(book.__dict__)
                with self.assertRaises(Rejected):
                    book.death(name)
                self.assertEqual(before, book.__dict__)
                with self.assertRaises(Rejected):
                    book.add(name, 100)
                with self.assertRaises(Rejected):
                    book.transfer('newborn', name, 0, consent=True)

    def test_both_deaths_clear_community(self):
        self.b.trade('a', 'b', 'wood', 1, 10, consent=True)
        self.b.death('a')
        self.b.death('b')
        self.assertEqual(self.b.community_balance, 0)
        self.assert_balanced(self.b)

    def test_firm_closure_is_not_person_death(self):
        self.b.add('firm', 10, kind='firm')
        before = copy.deepcopy(self.b.__dict__)
        with self.assertRaises(Rejected):
            self.b.death('firm')
        self.assertEqual(before, self.b.__dict__)

    def test_production_resource_constraints(self):
        physical = Physical(self.b)
        physical.produce('a', {'wood': 2}, {'box': 1}, 3, 3)
        physical.consume('a', 'box', 2)
        before = copy.deepcopy(self.b.__dict__)
        with self.assertRaises(Rejected):
            physical.produce('a', {'wood': 2}, {'box': 1}, 3, 3)
        self.assertEqual(before, self.b.__dict__)
        self.assert_balanced(self.b)

    def test_invariants_detect_corruption(self):
        self.b.agents['a'].balance = 1
        with self.assertRaisesRegex(AssertionError, 'sum to zero'):
            self.b.check()
        self.b.agents['a'].balance = 0
        self.b.agents['a'].goods['wood'] += 1
        with self.assertRaisesRegex(AssertionError, 'physical stock'):
            self.b.check()

    def test_multi_seed_reproducibility_and_controls(self):
        self.assertEqual(run(7, 10), run(7, 10))
        for seed in range(5):
            for kwargs in ({}, {'cap_scale': 0}, {'resource': 2}, {'mortality': .1}):
                with self.subTest(seed=seed, kwargs=kwargs):
                    result = run(seed, 20, **kwargs)
                    for row in result['rows']:
                        self.assertEqual(sum(row['balances'].values()), row['balance_sum'])
                        self.assertEqual(row['balance_sum'] + row['community_balance'], 0)
                        self.assertEqual(row['accounting_error'], 0)
                        self.assertEqual(row['positive_balance_total'] + row['negative_balance_total'],
                                         row['balance_sum'])
                    if kwargs.get('cap_scale') == 0:
                        self.assertTrue(all(row['gross_balance'] == 0 for row in result['rows']))
        first = run()['rows'][0]
        self.assertGreater(first['transfer_volume'], 0)
        self.assertGreater(first['positive_balance_total'], 0)
        self.assertLess(first['negative_balance_total'], 0)

    def test_full_mortality_keeps_system_balanced(self):
        result = run(periods=3, mortality=1)
        self.assertTrue(all(x == 0 for x in result['rows'][-1]['balances'].values()))
        self.assertEqual(result['rows'][-1]['community_balance'], 0)
        self.assertEqual(result['rows'][-1]['gross_balance'], 0)

    def test_invalid_simulation_parameters_and_empty_run(self):
        for kwargs in ({'periods': -1}, {'resource': -1}, {'cap_scale': float('nan')},
                       {'cap_scale': float('inf')}, {'mortality': 2}):
            with self.subTest(kwargs=kwargs), self.assertRaises(ValueError):
                run(**kwargs)
        self.assertEqual(run(periods=0)['rows'], [])

    def test_scenario_outputs_match_signed_balances(self):
        from velkatalous.scenarios import generate
        with tempfile.TemporaryDirectory() as directory:
            report = generate(directory)
            self.assertEqual(report['model'], 'relative-balances-v2')
            self.assertEqual(set(report['scenarios']), {'baseline', 'zero_limit', 'scarcity', 'mortality'})
            for name, summary in report['scenarios'].items():
                result = json.loads((Path(directory) / f'{name}.json').read_text())
                self.assertEqual(summary['balance_sum'], sum(result['rows'][-1]['balances'].values()))
                self.assertEqual(summary['balance_sum'] + summary['community_balance'], 0)
                self.assertEqual(summary['total_transfer_volume'],
                                 sum(row['transfer_volume'] for row in result['rows']))


if __name__ == '__main__':
    unittest.main()

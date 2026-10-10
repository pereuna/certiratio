import copy
import unittest
from velkatalous.monte_carlo import AuditedLedger, run


class MonteCarloTests(unittest.TestCase):
    def test_long_run_births_deaths_and_reproducibility(self):
        a = run(seed=3, years=300, population=6)
        self.assertEqual(a, run(seed=3, years=300, population=6))
        self.assertGreater(a['counts']['death'], 6)
        self.assertGreater(a['counts']['trade'], 0)
        self.assertEqual(a['max_accounting_error'], 0)
        for year in a['annual']:
            self.assertEqual(year['balance_sum'] + year['community_balance'], 0)
            self.assertEqual(year['accounting_error'], 0)
            self.assertEqual(year['positive_balance_total'] + year['negative_balance_total'],
                             year['balance_sum'])

    def test_first_year_trades_need_no_creation_or_promises(self):
        result = run(seed=5, years=1, population=6)
        first = result['annual'][0]
        self.assertGreater(first['trades'], 0)
        self.assertGreater(first['positive_balance_total'], 0)
        self.assertLess(first['negative_balance_total'], 0)
        self.assertEqual(first['balance_sum'], 0)

    def test_independent_audit_detects_wrong_owner_even_if_total_matches(self):
        b = AuditedLedger()
        b.add('a', 100, goods={'service': 1})
        b.add('b', 100)
        b.trade('a', 'b', 'service', 1, 10, consent=True)
        b.agents['b'].balance -= 1
        b.agents['a'].balance += 1
        b.check()  # aggregate accounting still balances
        with self.assertRaisesRegex(AssertionError, 'account replay'):
            b.audit()

    def test_independent_audit_of_both_death_signs(self):
        b = AuditedLedger()
        b.add('a', 100, goods={'service': 1})
        b.add('b', 100)
        b.trade('a', 'b', 'service', 1, 10, consent=True)
        for name, expected in [('a', -10), ('b', 10)]:
            with self.subTest(name=name):
                book = copy.deepcopy(b)
                book.death(name)
                self.assertEqual(book.shadow_community, expected)
                self.assertEqual(book.community_balance, expected)
                book.audit()

    def test_audit_detects_community_and_person_compensating_corruption(self):
        b = AuditedLedger()
        b.add('a', 100)
        b.agents['a'].balance -= 1
        b.community_balance += 1
        b.check()
        with self.assertRaisesRegex(AssertionError, 'account replay'):
            b.audit()

    def test_audit_detects_wrong_turnover(self):
        b = AuditedLedger()
        b.add('a', 100)
        b.volume += 1
        with self.assertRaisesRegex(AssertionError, 'volume mismatch'):
            b.audit()

    def test_rejected_trade_preserves_audit_state(self):
        from velkatalous.ledger import Rejected
        b = AuditedLedger()
        b.add('a', 100, goods={'service': 1})
        b.add('b', 0)
        before = copy.deepcopy(b.__dict__)
        with self.assertRaises(Rejected):
            b.trade('a', 'b', 'service', 1, 10, consent=True)
        self.assertEqual(before, b.__dict__)


if __name__ == '__main__':
    unittest.main()

import copy
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

    def test_creation_transfer_and_death(self):
        self.b.trade('a', 'b', 'wood', 1, 10, 1, True)
        self.b.settle(0)
        self.assertEqual(self.b.created, 0)
        self.b.settle(1)
        self.b.transfer('b', 'c', 4, True)
        self.assertEqual((self.b.created, self.b.volume), (10, 4))
        self.b.death('c')
        self.assertEqual(self.b.extinguished, 4)
        self.b.check()

    def test_only_missing_part_created_and_no_double_settlement(self):
        self.b.trade('a', 'b', 'wood', 1, 5, 0, True)
        self.b.settle(0)
        self.b.trade('b', 'c', 'wood', 1, 8, 1, True)
        self.b.settle(1)
        self.b.settle(1)
        self.assertEqual((self.b.created, self.b.volume, self.b.agents['c'].debt), (8, 5, 8))

    def test_reservation_and_atomic_rejection(self):
        self.b.agents['b'].limit = 10
        self.b.trade('a', 'b', 'wood', 1, 7, 1, True)
        before = copy.deepcopy(self.b.__dict__)
        with self.assertRaises(Rejected):
            self.b.trade('a', 'b', 'wood', 1, 4, 1, True)
        self.assertEqual(before, self.b.__dict__)
        with self.assertRaises(Rejected):
            self.b.trade('a', 'c', 'wood', 1, 2, 0)

    def test_limit_reduction_blocks_without_erasure(self):
        p = self.b.trade('a', 'b', 'wood', 1, 10, 0, True)
        self.b.agents['b'].limit = 5
        self.b.settle(0)
        self.assertEqual(p.status, 'open')
        self.assertEqual(self.b.created, 0)
        self.b.agents['b'].limit = 10
        self.b.settle(1)
        self.assertEqual(p.status, 'settled')

    def test_no_creation_control_and_free_gift(self):
        p = self.b.trade('a', 'b', 'wood', 1, 5, 0, True)
        self.b.settle(0, creation=False)
        self.assertEqual(p.status, 'open')
        self.b.trade('a', 'c', 'wood', 1, 0, 0, True)
        self.b.settle(0, creation=False)
        self.assertEqual(self.b.created, 0)

    def test_production_resource_constraints(self):
        Physical(self.b).produce('a', {'wood': 2}, {'box': 1}, 3, 3)
        Physical(self.b).consume('a', 'box', 2)
        before = copy.deepcopy(self.b.__dict__)
        with self.assertRaises(Rejected):
            Physical(self.b).produce('a', {'wood': 2}, {'box': 1}, 3, 3)
        self.assertEqual(before, self.b.__dict__)
        self.b.check()

    def test_death_cancels_and_firm_closure_undefined(self):
        p = self.b.trade('a', 'b', 'wood', 1, 5, 0, True)
        self.b.death('a')
        self.assertEqual(p.status, 'cancelled')
        self.b.settle(0)
        self.b.add('firm', 10, kind='firm')
        with self.assertRaises(Rejected):
            self.b.death('firm')

    def test_multi_seed_reproducibility_and_controls(self):
        self.assertEqual(run(7, 10), run(7, 10))
        for seed in range(5):
            for kwargs in ({}, {'creation': False}, {'cap_scale': 0}, {'resource': 2}, {'mortality': .1}):
                result = run(seed, 20, **kwargs)
                for row in result['rows']:
                    self.assertEqual(row['total_debt'], row['created_debt'] - row['death_extinguished_debt'])
                if kwargs.get('creation') is False or kwargs.get('cap_scale') == 0:
                    self.assertEqual(result['rows'][-1]['total_debt'], 0)


if __name__ == '__main__':
    unittest.main()

import unittest
from velkatalous.monte_carlo import AuditedLedger, run


class MonteCarloTests(unittest.TestCase):
    def test_long_run_births_deaths_and_reproducibility(self):
        a = run(seed=3, years=300, population=6)
        self.assertEqual(a, run(seed=3, years=300, population=6))
        self.assertGreater(a['counts']['death'], 6)
        self.assertGreater(a['counts']['settlement'], 0)
        self.assertEqual(a['max_accounting_error'], 0)
        for year in a['annual']:
            self.assertEqual(year['debt'], year['created'] - year['extinguished'])
            self.assertEqual(year['debt'], year['community_claim'])

    def test_without_creation_debt_remains_zero(self):
        result = run(seed=5, years=100, population=6, creation=False)
        self.assertTrue(all(row['debt'] == 0 for row in result['annual']))

    def test_independent_audit_detects_wrong_owner_even_if_total_matches(self):
        b = AuditedLedger()
        b.add('a', 100, goods={'service': 1})
        b.add('b', 100)
        b.trade('a', 'b', 'service', 1, 10, 0, True)
        b.settle(0)
        b.agents['b'].debt -= 1
        b.agents['a'].debt += 1
        b.check()  # aggregate accounting still balances
        with self.assertRaisesRegex(AssertionError, 'account replay'):
            b.audit()


if __name__ == '__main__':
    unittest.main()

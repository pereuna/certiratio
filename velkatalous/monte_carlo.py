"""300-year randomized accounting stress test, not an economic forecast.

Run: python3 -m velkatalous.monte_carlo --runs 100 --years 300
"""
import argparse
from collections import Counter
import csv
import json
from pathlib import Path
import random

from .ledger import Ledger, Rejected
from .physical import Physical


class AuditedLedger(Ledger):
    """Independently replay debt events; compare every account after every event."""
    def __init__(self):
        super().__init__()
        self.shadow = Counter()
        self.community_claim = 0
        self.counts = Counter()
        self.max_error = 0

    def _record(self, event, **fields):
        self.events.append({'event': event, **fields})
        if event in ('birth', 'register'):
            self.shadow[fields['name']] = 0
        elif event == 'transfer':
            self.shadow[fields['seller']] -= fields['amount']
            self.shadow[fields['buyer']] += fields['amount']
        elif event == 'settlement':
            seller, buyer = fields['seller'], fields['buyer']
            amount = fields['amount']
            existing = min(self.shadow[seller], amount)
            created = amount - existing
            if fields['created'] != created or fields['transferred'] != existing:
                raise AssertionError('settlement decomposition mismatch')
            self.shadow[seller] -= existing
            self.shadow[buyer] += amount
            self.community_claim += created
        elif event == 'death':
            self.community_claim -= self.shadow[fields['name']]
            self.shadow[fields['name']] = 0
        self.counts[event] += 1
        self.audit()

    def audit(self):
        self.check()
        actual = {name: a.debt for name, a in self.agents.items()}
        if actual != dict(self.shadow):
            raise AssertionError('independent account replay mismatch')
        debt = sum(actual.values())
        error = abs(debt - self.community_claim)
        self.max_error = max(self.max_error, error)
        if error or self.community_claim != self.created - self.extinguished:
            raise AssertionError('community claim mismatch')


def run(seed=0, years=300, population=30, creation=True):
    if years < 1 or population < 2:
        raise ValueError('years >= 1 and population >= 2 required')
    rng = random.Random(seed)
    book = AuditedLedger()
    physical = Physical(book)
    people = {}
    serial = 0

    def birth(initial=False):
        nonlocal serial
        name = f'p{serial}'
        serial += 1
        age = rng.randint(20, 60) if initial else 0
        # Synthetic lifetimes, deliberately not demographic estimates.
        people[name] = {'age': age, 'dies_at': rng.randint(max(65, age+1), 100),
                        'capacity': rng.randint(2, 8)}
        book.add(name, 0)

    for _ in range(population):
        birth(initial=True)
    annual = []
    rejected = 0
    previous_counts = Counter()
    for year in range(years):
        for name in list(people):
            people[name]['age'] += 1
            if people[name]['age'] >= people[name]['dies_at']:
                book.death(name)
                del people[name]
                birth()
        adults = [n for n, p in people.items() if p['age'] >= 18]
        for name, p in people.items():
            # No access to sampled actual death date. Random uncertain capacity forecast.
            horizon = max(0, 90 - p['age'])
            book.agents[name].limit = int(horizon * p['capacity'] * rng.uniform(.25, 1.5)) if p['age'] >= 18 else 0
        book.audit()
        book.settle(year, creation=creation)
        remaining_hours = {n: people[n]['capacity'] for n in adults}
        year_rejected = 0
        # Each attempted service is physical work, independently bounded by time budget.
        for _ in range(2 * len(adults)):
            seller, buyer = rng.sample(adults, 2) if len(adults) >= 2 else (None, None)
            if seller is None:
                break
            if remaining_hours[seller] <= 0:
                continue
            remaining_hours[seller] -= 1
            physical.produce(seller, {}, {'service': 1}, 1, 1)
            try:
                book.trade(seller, buyer, 'service', 1, rng.randint(1, 20),
                           year + rng.randint(0, 2), consent=rng.random() < .95)
            except Rejected:
                rejected += 1
                year_rejected += 1
                physical.expire(seller, 'service', 1)
            else:
                physical.consume(buyer, 'service', 1)
        book.settle(year, creation=creation)
        book.audit()
        counts = book.counts - previous_counts
        previous_counts = book.counts.copy()
        annual.append({'year': year+1, 'debt': sum(a.debt for a in book.agents.values()),
                       'community_claim': book.community_claim, 'created': book.created,
                       'extinguished': book.extinguished, 'error': book.max_error,
                       'adults': len(adults), 'trades': counts['trade'],
                       'settlements': counts['settlement'], 'deaths': counts['death'],
                       'rejected': year_rejected,
                       'open_promises': sum(p.status == 'open' for p in book.promises),
                       'overdue_promises': sum(p.status == 'open' and p.due <= year for p in book.promises)})
        # Remove only closed contracts from the active work queue; counts are retained.
        book.promises = [p for p in book.promises if p.status == 'open']
        book.events.clear()
    return {'seed': seed, 'years': years, 'population': population, 'creation': creation,
            'max_accounting_error': book.max_error, 'events_checked': sum(book.counts.values()),
            'counts': dict(book.counts), 'rejected_trades': rejected, 'annual': annual}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runs', type=int, default=100)
    parser.add_argument('--years', type=int, default=300)
    parser.add_argument('--population', type=int, default=30)
    parser.add_argument('--seed', type=int, default=0)
    parser.add_argument('--no-creation', action='store_true')
    parser.add_argument('--output', type=Path, default=Path('results/monte_carlo'))
    args = parser.parse_args()
    if args.runs < 1 or args.years < 1 or args.population < 2:
        parser.error('runs/years >= 1 and population >= 2 required')
    args.output.mkdir(parents=True, exist_ok=True)
    summaries = []
    with (args.output / 'annual.csv').open('w', newline='') as f:
        writer = None
        for seed in range(args.seed, args.seed + args.runs):
            result = run(seed, args.years, args.population, not args.no_creation)
            for row in result['annual']:
                if writer is None:
                    writer = csv.DictWriter(f, fieldnames=['seed'] + list(row))
                    writer.writeheader()
                writer.writerow({'seed': seed, **row})
            last = result['annual'][-1]
            summaries.append({k: v for k, v in result.items() if k != 'annual'} | {'final': last})
            if len(summaries) % 10 == 0:
                print(f'{len(summaries)}/{args.runs} runs checked', flush=True)
    report = {'runs': args.runs, 'years_per_run': args.years, 'population': args.population,
              'creation': not args.no_creation,
              'events_checked': sum(r['events_checked'] for r in summaries),
              'max_accounting_error': max(r['max_accounting_error'] for r in summaries),
              'min_final_debt': min(r['final']['debt'] for r in summaries),
              'max_final_debt': max(r['final']['debt'] for r in summaries),
              'min_final_overdue': min(r['final']['overdue_promises'] for r in summaries),
              'max_final_overdue': max(r['final']['overdue_promises'] for r in summaries),
              'results': summaries}
    (args.output / 'summary.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({k: v for k, v in report.items() if k != 'results'}))


if __name__ == '__main__':
    main()

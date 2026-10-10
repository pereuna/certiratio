"""Toy ABM: heterogeneous workers and person-owned Leontief production units."""
import argparse
import json
import math
import random
from pathlib import Path
from .ledger import Ledger, Rejected
from .physical import Physical
from .policies import forecast_limit


def run(seed=7, periods=30, *, cap_scale=1.0, resource=200, mortality=0.0):
    if (type(periods) is not int or periods < 0 or type(resource) is not int or resource < 0
            or not math.isfinite(cap_scale) or cap_scale < 0 or not 0 <= mortality <= 1):
        raise ValueError('invalid parameter range')
    rng = random.Random(seed)
    book = Ledger()
    physical = Physical(book)
    owners = ['farm', 'forest', 'workshop']
    for owner in owners:
        book.add(owner, int(100 * cap_scale), goods={'resource': resource} if owner != 'workshop' else {})
    workers = [f'worker{i}' for i in range(9)]
    preferences = {}
    horizon = {}
    prior = {}
    for name in workers:
        book.add(name, int(40 * cap_scale))
        preferences[name] = rng.choice([1, 2, 3])  # desired consumption and offered hours
    for name in owners + workers:
        horizon[name] = rng.randint(40, 80)
        prior[name] = 4 if name in owners else preferences[name] * 2
    rows = []
    previous_gross = 0
    previous_volume = 0
    previous_events = 0
    for t in range(periods):
        rejections = unmet = hours = 0
        # Limit is a deliberately uncalibrated forecast, not an oracle of future capacity.
        for name, a in book.agents.items():
            if not a.alive:
                continue
            recent = sum(e['amount'] for e in book.events
                         if e['event'] in ('trade', 'transfer') and e.get('seller') == name
                         and t - 5 <= e.get('tick', -100) < t)
            a.limit = forecast_limit(prior[name], recent, horizon[name] - t, cap_scale)
        # Work hours are freshly supplied, sold as services, used or expire this period.
        for name in workers:
            if not book.agents[name].alive:
                continue
            offered = preferences[name]
            physical.produce(name, {}, {'labor': 1}, offered, offered)
            employer = owners[int(name[6:]) % 3]
            if not book.agents[employer].alive:
                continue
            try:
                book.trade(name, employer, 'labor', offered, 2 * offered, consent=True)
                hours += offered
            except Rejected:
                rejections += 1
        recipes = [('farm', {'resource': 1, 'labor': 1}, {'food': 2}),
                   ('forest', {'resource': 1, 'labor': 1}, {'wood': 1})]
        for name, inputs, outputs in recipes:
            a = book.agents[name]
            if a.alive:
                batches = min(6, *(a.goods[g] // q for g, q in inputs.items()))
                physical.produce(name, inputs, outputs, batches, 6)
        if book.agents['forest'].alive and book.agents['workshop'].alive:
            q = min(6, book.agents['forest'].goods['wood'])
            if q:
                try:
                    book.trade('forest', 'workshop', 'wood', q, 2*q, consent=True)
                except Rejected:
                    rejections += 1
            a = book.agents['workshop']
            batches = min(6, a.goods['wood'], a.goods['labor'])
            physical.produce('workshop', {'wood': 1, 'labor': 1}, {'box': 1}, batches, 6)
        customers = [n for n in owners + workers if book.agents[n].alive]
        rng.shuffle(customers)
        for name in customers:
            wants = preferences.get(name, 1)
            for seller, good, desired, price in [('farm', 'food', wants, 2), ('workshop', 'box', int(rng.random() < 0.3), 4)]:
                if seller == name:
                    q = min(desired, book.agents[name].goods[good])
                elif book.agents[seller].alive:
                    q = min(desired, book.agents[seller].goods[good])
                    if q:
                        try:
                            book.trade(seller, name, good, q, price*q, consent=True)
                        except Rejected:
                            rejections += 1
                            q = 0
                else:
                    q = 0
                physical.consume(name, good, q)
                unmet += desired - q
        for name in customers:
            # Labor cannot be stored across periods.
            physical.expire(name, 'labor', book.agents[name].goods['labor'])
            if rng.random() < mortality:
                book.death(name)
        for event in book.events[previous_events:]:
            event['tick'] = t
        previous_events = len(book.events)
        book.check()
        metrics = book.metrics()
        volume = book.volume - previous_volume
        average = (previous_gross + metrics['gross_balance']) / 2
        rows.append({'tick': t, **metrics, 'transfer_volume': volume,
                     'turnover_per_gross_balance': volume / average if average else None,
                     'consumption': dict(book.consumed), 'production': dict(book.produced),
                     'hours': hours, 'unmet_demand': unmet, 'rejected_trades': rejections,
                     'over_limit': sum(a.alive and a.balance > a.limit for a in book.agents.values()),
                     'balances': {n: a.balance for n, a in book.agents.items()},
                     'stocks': {n: dict(a.goods) for n, a in book.agents.items()}})
        previous_gross, previous_volume = metrics['gross_balance'], book.volume
    return {'model': 'relative-balances-v2', 'parameters': {'seed': seed, 'periods': periods,
                            'cap_scale': cap_scale, 'resource': resource, 'mortality': mortality},
            'rows': rows, 'events': book.events}


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--seed', type=int, default=7)
    p.add_argument('--periods', type=int, default=30)
    p.add_argument('--cap-scale', type=float, default=1.0)
    p.add_argument('--resource', type=int, default=200)
    p.add_argument('--mortality', type=float, default=0.0)
    p.add_argument('--output', type=Path, default=Path('results/baseline.json'))
    args = p.parse_args()
    if args.periods < 0 or not math.isfinite(args.cap_scale) or args.cap_scale < 0 or args.resource < 0 or not 0 <= args.mortality <= 1:
        p.error('invalid parameter range')
    result = run(args.seed, args.periods, cap_scale=args.cap_scale,
                 resource=args.resource, mortality=args.mortality)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({'output': str(args.output), 'last': result['rows'][-1] if result['rows'] else None}))


if __name__ == '__main__':
    main()

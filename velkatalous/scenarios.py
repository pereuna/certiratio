"""Regenerate the four documented relative-balance ABM scenarios."""
import argparse
import json
from pathlib import Path

from .simulation import run


SCENARIOS = {'baseline': {}, 'zero_limit': {'cap_scale': 0},
             'scarcity': {'resource': 2}, 'mortality': {'mortality': .05}}


def generate(output):
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    summary = {}
    for name, parameters in SCENARIOS.items():
        result = run(seed=7, periods=30, **parameters)
        (output / f'{name}.json').write_text(json.dumps(result, indent=2) + '\n')
        last = result['rows'][-1]
        summary[name] = {k: last[k] for k in (
            'balance_sum', 'community_balance', 'positive_balance_total',
            'negative_balance_total', 'gross_balance', 'accounting_error', 'consumption')}
        summary[name]['total_transfer_volume'] = sum(row['transfer_volume'] for row in result['rows'])
        summary[name]['total_rejected_trades'] = sum(row['rejected_trades'] for row in result['rows'])
    report = {'model': 'relative-balances-v2', 'seed': 7, 'periods': 30, 'scenarios': summary}
    (output / 'summary.json').write_text(json.dumps(report, indent=2) + '\n')
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=Path('results'))
    args = parser.parse_args()
    print(json.dumps(generate(args.output)))


if __name__ == '__main__':
    main()

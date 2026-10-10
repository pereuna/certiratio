"""Signed relative positions; the unmeasured historical baseline is not stored."""
from collections import Counter
from dataclasses import dataclass, field


@dataclass
class Agent:
    name: str
    limit: int
    kind: str = 'person'
    balance: int = 0
    alive: bool = True
    goods: Counter = field(default_factory=Counter)


class Rejected(ValueError):
    pass


class Ledger:
    def __init__(self):
        self.agents = {}
        self.community_balance = 0
        self.volume = 0
        self.initial = Counter()
        self.produced = Counter()
        self.used = Counter()
        self.consumed = Counter()
        self.destroyed = Counter()
        self.events = []

    def add(self, name, limit, kind='person', goods=None):
        if name in self.agents or type(limit) is not int or limit < 0:
            raise Rejected('invalid identity or limit')
        goods = Counter(goods or {})
        self._quantities(goods)
        self.agents[name] = Agent(name, limit, kind, goods=goods)
        self.initial.update(goods)
        self._record('birth' if kind == 'person' else 'register', name=name)

    @staticmethod
    def _quantities(values):
        if any(type(v) is not int or v < 0 for v in values.values()):
            raise Rejected('quantities must be nonnegative integers')

    def active(self, name):
        if name not in self.agents or not self.agents[name].alive:
            raise Rejected('unknown or inactive actor')
        return self.agents[name]

    def _participants(self, seller, buyer, amount, consent):
        a, b = self.active(seller), self.active(buyer)
        self._quantities({'amount': amount})
        if seller == buyer or consent is not True:
            raise Rejected('distinct actors and explicit consent required')
        # A reduced forecast never erases balances. Gifts add no position.
        if amount > 0 and b.balance + amount > b.limit:
            raise Rejected('recipient limit exceeded')
        return a, b

    def _move(self, a, b, amount):
        # A seller can move below zero: there is no seller balance requirement.
        a.balance -= amount
        b.balance += amount
        self.volume += amount

    def transfer(self, seller, buyer, amount, consent=False):
        a, b = self._participants(seller, buyer, amount, consent)
        self._move(a, b, amount)
        self._record('transfer', seller=seller, buyer=buyer, amount=amount)

    def trade(self, seller, buyer, good, quantity, amount, consent=False):
        """Transfer goods and relative positions together, after all validation."""
        a, b = self._participants(seller, buyer, amount, consent)
        self._quantities({'quantity': quantity})
        if (amount > 0 and quantity == 0) or a.goods[good] < quantity:
            raise Rejected('positive price requires a delivered good or service')
        a.goods[good] -= quantity
        b.goods[good] += quantity
        self._move(a, b, amount)
        self._record('trade', seller=seller, buyer=buyer, good=good,
                     quantity=quantity, amount=amount)

    def death(self, name):
        a = self.active(name)
        if a.kind != 'person':
            raise Rejected('firm closure undefined')
        balance = a.balance
        # Both signs move unchanged to a non-spendable community clearing account.
        self.community_balance += balance
        a.balance = 0
        self.destroyed.update(a.goods)
        a.goods.clear()
        a.alive = False
        self._record('death', name=name, balance=balance)

    def metrics(self):
        balances = [a.balance for a in self.agents.values() if a.alive]
        return {'balance_sum': sum(balances),
                'community_balance': self.community_balance,
                'positive_balance_total': sum(x for x in balances if x > 0),
                'negative_balance_total': sum(x for x in balances if x < 0),
                'gross_balance': sum(abs(x) for x in balances),
                'accounting_error': abs(sum(balances) + self.community_balance)}

    def check(self):
        total = self.community_balance
        if type(total) is not int:
            raise AssertionError('community position must be an integer')
        stocks = {}
        for a in self.agents.values():
            if type(a.balance) is not int or (not a.alive and a.balance != 0):
                raise AssertionError('invalid relative position')
            total += a.balance
            for g, quantity in a.goods.items():
                if type(quantity) is not int or quantity < 0 or (not a.alive and quantity):
                    raise AssertionError('invalid physical stock')
                stocks[g] = stocks.get(g, 0) + quantity
        if total != 0:
            raise AssertionError('relative positions and community must sum to zero')
        keys = (set(self.initial) | set(self.produced) | set(self.used)
                | set(self.consumed) | set(self.destroyed) | set(stocks))
        for g in keys:
            expected = self.initial[g] + self.produced[g] - self.used[g] - self.consumed[g] - self.destroyed[g]
            if stocks.get(g, 0) != expected:
                raise AssertionError(f'physical stock mismatch: {g}')

    def _record(self, event, **fields):
        self.check()
        self.events.append({'event': event, **fields})

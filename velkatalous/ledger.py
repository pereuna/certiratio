"""Deterministic experimental protocol. Debt and physical quantities are integers."""
from collections import Counter
from dataclasses import dataclass, field


@dataclass
class Agent:
    name: str
    limit: int
    kind: str = 'person'
    debt: int = 0
    alive: bool = True
    goods: Counter = field(default_factory=Counter)


@dataclass
class Promise:
    seller: str
    buyer: str
    amount: int
    due: int
    status: str = 'open'


class Rejected(ValueError):
    pass


class Ledger:
    def __init__(self):
        self.agents = {}
        self.promises = []
        self.created = self.extinguished = self.volume = 0
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
        a = self.agents[name]
        if not a.alive:
            raise Rejected('inactive actor')
        return a

    def reserved(self, name):
        return sum(p.amount for p in self.promises if p.buyer == name and p.status == 'open')

    def transfer(self, seller, buyer, amount, consent=False):
        a, b = self.active(seller), self.active(buyer)
        self._quantities({'debt': amount})
        if seller == buyer or not consent or a.debt < amount or b.debt + self.reserved(buyer) + amount > b.limit:
            raise Rejected('transfer rejected')
        a.debt -= amount
        b.debt += amount
        self.volume += amount
        self._record('transfer', seller=seller, buyer=buyer, amount=amount)

    def trade(self, seller, buyer, good, quantity, amount, due, consent=False):
        """Goods now, debt later; incoming debt fully reserved, no outgoing reservation."""
        a, b = self.active(seller), self.active(buyer)
        self._quantities({'quantity': quantity, 'amount': amount, 'due': due})
        if seller == buyer or not consent or a.goods[good] < quantity or b.debt + self.reserved(buyer) + amount > b.limit:
            raise Rejected('trade rejected')
        a.goods[good] -= quantity
        b.goods[good] += quantity
        p = Promise(seller, buyer, amount, due)
        self.promises.append(p)
        self._record('trade', seller=seller, buyer=buyer, good=good, quantity=quantity, amount=amount, due=due)
        return p

    def settle(self, tick, creation=True):
        # FIFO is an explicit experimental choice. No partial settlement.
        for p in self.promises:
            if p.status != 'open' or p.due > tick:
                continue
            a, b = self.active(p.seller), self.active(p.buyer)
            if b.debt + self.reserved(b.name) > b.limit or (not creation and a.debt < p.amount):
                self._record('blocked', seller=p.seller, buyer=p.buyer, amount=p.amount)
                continue
            existing = min(a.debt, p.amount)
            missing = p.amount - existing
            a.debt -= existing
            b.debt += p.amount
            self.created += missing
            self.volume += existing
            p.status = 'settled'
            self._record('settlement', seller=p.seller, buyer=p.buyer, amount=p.amount, created=missing, transferred=existing)

    def death(self, name):
        a = self.active(name)
        if a.kind != 'person':
            raise Rejected('firm closure undefined')
        self.extinguished += a.debt
        a.debt = 0
        self.destroyed.update(a.goods)
        a.goods.clear()
        a.alive = False
        for p in self.promises:
            if name in (p.seller, p.buyer) and p.status == 'open':
                p.status = 'cancelled'
        self._record('death', name=name)

    def check(self):
        # One pass avoids repeated Counter.update overhead in long stress runs.
        debt = 0
        stocks = {}
        for a in self.agents.values():
            assert type(a.debt) is int and a.debt >= 0
            if a.alive:
                debt += a.debt
            else:
                assert a.debt == 0
            for g, quantity in a.goods.items():
                assert quantity >= 0
                stocks[g] = stocks.get(g, 0) + quantity
        assert debt == self.created - self.extinguished
        keys = set(self.initial) | set(self.produced) | set(stocks)
        for g in keys:
            assert stocks.get(g, 0) == self.initial[g] + self.produced[g] - self.used[g] - self.consumed[g] - self.destroyed[g], g

    def _record(self, event, **fields):
        self.check()
        self.events.append({'event': event, **fields})

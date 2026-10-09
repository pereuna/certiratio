"""Physical recipes and consumption; no debt decisions or mutations."""
from .ledger import Rejected


class Physical:
    def __init__(self, book):
        self.book = book

    def expire(self, name, good, quantity):
        a = self.book.active(name)
        self.book._quantities({'quantity': quantity})
        if a.goods[good] < quantity:
            raise Rejected('insufficient goods')
        a.goods[good] -= quantity
        self.book.destroyed[good] += quantity
        self.book._record('expiration', name=name, good=good, quantity=quantity)

    def produce(self, name, inputs, outputs, batches, capacity):
        a = self.book.active(name)
        self.book._quantities(inputs)
        self.book._quantities(outputs)
        self.book._quantities({'batches': batches, 'capacity': capacity})
        if batches > capacity or any(a.goods[g] < q * batches for g, q in inputs.items()):
            raise Rejected('physical production constraint')
        for g, q in inputs.items():
            a.goods[g] -= q * batches
            self.book.used[g] += q * batches
        for g, q in outputs.items():
            a.goods[g] += q * batches
            self.book.produced[g] += q * batches
        self.book._record('production', name=name, batches=batches, inputs=dict(inputs), outputs=dict(outputs))

    def consume(self, name, good, quantity):
        a = self.book.active(name)
        self.book._quantities({'quantity': quantity})
        if a.goods[good] < quantity:
            raise Rejected('insufficient goods')
        a.goods[good] -= quantity
        self.book.consumed[good] += quantity
        self.book._record('consumption', name=name, good=good, quantity=quantity)


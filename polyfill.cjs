const IteratorPrototype = Object.getPrototypeOf(Object.getPrototypeOf([][Symbol.iterator]()));

if (typeof IteratorPrototype.flatMap !== 'function') {
  IteratorPrototype.flatMap = function(mapper) {
    const self = this;
    const it = (function* () {
      for (const value of self) {
        const mapped = mapper(value);
        if (mapped && typeof mapped[Symbol.iterator] === 'function') {
          yield* mapped;
        } else {
          yield mapped;
        }
      }
    })();
    it.toArray = function() {
      return [...this];
    };
    return it;
  };
}

if (typeof IteratorPrototype.toArray !== 'function') {
  IteratorPrototype.toArray = function() {
    return [...this];
  };
}

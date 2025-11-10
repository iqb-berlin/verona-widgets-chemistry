/**
 * Declared marker Symbol for {@link Nominal} types
 */
declare const brand: unique symbol;

/**
 * A nominal type is unique, and even if types have the same data you cannot assign across types.
 *
 * TypeScript's type system is structural, which means
 * if the type is shaped like a duck, it's a duck. If a
 * goose has all the same attributes as a duck, then it also
 * is a duck. See: {@linkplain https://www.typescriptlang.org/docs/handbook/type-compatibility.html}
 *
 * This can have drawbacks, for example there are cases
 * where a string or number can have special context, and you
 * don't want to ever make the values transferable. For example:
 * -  User Input Strings (unsafe)
 * -  Translation Strings
 * -  User Identification Numbers
 * -  Access Tokens
 *
 * This type can be used to declare intersectional types, with a unique
 * constraint in the form of a symbol-property called "brand" (symbol is only declared, but does not actually exist)
 * which makes it impossible to assign a normal string to a branded nominal string.
 */
export type Nominal<T, B extends string> = T & { [brand]: B };

export type ReadonlyRecord<K extends PropertyKey, T> = Readonly<Record<K, T>>;

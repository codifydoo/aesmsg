declare const __idBrand: unique symbol;
declare const __pubBrand: unique symbol;
declare const __ctBrand: unique symbol;
declare const __wrappedBrand: unique symbol;
declare const __pkStrBrand: unique symbol;
declare const __fpBrand: unique symbol;

export type IdentityKeypair = { readonly [__idBrand]: undefined };
export type RecipientPublicKey = { readonly [__pubBrand]: undefined };
export type Ciphertext = { readonly [__ctBrand]: undefined };
export type WrappedKey = string & { readonly [__wrappedBrand]: undefined };
export type PublicKeyString = string & { readonly [__pkStrBrand]: undefined };
export type Fingerprint = string & { readonly [__fpBrand]: undefined };

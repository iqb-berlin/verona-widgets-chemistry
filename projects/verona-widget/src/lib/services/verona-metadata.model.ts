/**
 * Metadata describing a Verona module
 */
export interface VeronaModuleMetadata {
  type: VeronaModuleType;
  id: VeronaIdentifier;
  name: VeronaTranslatedText;
  description?: VeronaDescription;
  version: string;
  specVersion: string;
  metadataVersion: string;
  dependencies?: ReadonlyArray<VeronaDependency>;
  maintainer?: VeronaMaintainerInfo;
  code?: VeronaCodeInfo;
}

export type VeronaModuleType =
  | 'EDITOR'
  | 'PLAYER'
  | 'SCHEMER'
  | 'WIDGET_CALC'
  | 'WIDGET_PERIODIC_TABLE'
  | 'WIDGET_MOLECULE_EDITOR';

/**
 * The id will be used as reference by any application using this module
 */
export type VeronaIdentifier = string;

/**
 * This language code declares the language of the value.
 */
export type LanguageAsISO6391Alpha2Code = string;

/**
 * Name to be used in lists or forms when the identifier is too short
 */
export type VeronaTranslatedText = ReadonlyArray<{ lang: LanguageAsISO6391Alpha2Code; value: string }>;

/**
 * The description should include any use case and should refer to used data formats.
 */
export type VeronaDescription = ReadonlyArray<{ lang: LanguageAsISO6391Alpha2Code; value: string }>;

/**
 * Type of dependency. This helps to find and access the dependency.
 */
export type VeronaDependencyType = 'FILE' | 'WIDGET' | 'SERVICE';

export interface VeronaDependency {
  id: string;
  description?: string;
  type: VeronaDependencyType;
  required?: boolean;
}

/**
 * Maintainer of the verona module
 */
export interface VeronaMaintainerInfo {
  name?: VeronaTranslatedText;
  url?: string;
  email?: string;
}

/**
 * Data about source code
 */
export interface VeronaCodeInfo {
  repositoryType?: string;
  repositoryUrl?: string;
  licenseType?: string;
  licenseUrl?: string;
}

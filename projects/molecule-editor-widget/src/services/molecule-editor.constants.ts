import type { MoleculeEditorBondingType } from './molecule-editor.service';

export const editorHistoryCapacity = 100;
export const defaultBondingType = 'ELECTRONS' satisfies MoleculeEditorBondingType;

export const snapRadius = 80;
export const snapProximityRadius = 60;

export const atomHandleRadius = 20.0;
export const singleElectronDist = 28.0;
export const singleElectronRadius = 4.0;
export const doubleElectronDist = 28.0;
export const doubleElectronWidth = 12.0;
export const doubleElectronRadius = 3.5;

export const bondSeparation = 6.0;
export const electronBondRadius = 4.0;
export const valenceBondRadius = 4.0;

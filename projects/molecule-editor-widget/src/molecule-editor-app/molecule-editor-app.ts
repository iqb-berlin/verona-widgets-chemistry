import { Component } from '@angular/core';
import { VeronaWidget } from 'verona-widget';
import { MoleculeEditor } from '../components/molecule-editor/molecule-editor';

@Component({
  selector: 'app-molecule-editor-root',
  imports: [VeronaWidget, MoleculeEditor],
  template: `
    <lib-verona-widget metadataSelector="#metadata">
      <ng-template #content>
        <app-molecule-editor></app-molecule-editor>
      </ng-template>
    </lib-verona-widget>
  `,
})
export class MoleculeEditorApp {}

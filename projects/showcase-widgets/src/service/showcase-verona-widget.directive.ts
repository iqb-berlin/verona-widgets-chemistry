import { Directive, effect, inject, input, TemplateRef, ViewContainerRef } from '@angular/core';
import { ShowcaseVeronaWidgetService } from './showcase-verona-widget.service';
import { VeronaModuleMetadata, VeronaModuleType } from 'verona-widget';

type ModuleInfo = readonly [type: VeronaModuleType, id?: string];

@Directive({ selector: '[showcaseVeronaWidget]' })
export class ShowcaseVeronaWidgetDirective {
  readonly moduleInfo = input.required<ModuleInfo>({ alias: 'showcaseVeronaWidget' });

  readonly service = inject(ShowcaseVeronaWidgetService);

  constructor(
    private readonly viewContainerRef: ViewContainerRef,
    private readonly templateRef: TemplateRef<any>,
  ) {
    effect(() => {
      const state = this.service.state();
      this.viewContainerRef.clear();
      switch (state.state) {
        case 'initializing':
          console.log('Showcase widget initializing, sending start command ...');
          this.service.sendReady(this.createMetadata());
          break;
        case 'ready':
          console.log('Showcase widget ready, should be running soon ...');
          break;
        case 'running':
          console.log('Showcase widget is running, mounting component');
          this.viewContainerRef.createEmbeddedView(this.templateRef);
          break;
      }
    });
  }

  private createMetadata(): VeronaModuleMetadata {
    const [type, id = 'showcase-widget'] = this.moduleInfo();
    return {
      id,
      type,
      name: [{ lang: 'en', value: 'showcase dummy widget' }],
      version: '0.0',
      specVersion: '0.0',
      metadataVersion: '0.0',
    };
  }
}

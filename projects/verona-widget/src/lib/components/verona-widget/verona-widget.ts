import { AfterViewInit, Component, contentChild, DOCUMENT, inject, input, TemplateRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { VeronaWidgetService } from '../../services/verona-widget.service';
import { VeronaModuleMetadata } from '../../services/verona-metadata.model';
import { IFrameVeronaWidgetService } from '../../services/verona-widget.service.iframe';

@Component({
  selector: 'lib-verona-widget',
  imports: [CommonModule],
  templateUrl: './verona-widget.html',
  providers: [
    IFrameVeronaWidgetService,
    {
      provide: VeronaWidgetService,
      useExisting: IFrameVeronaWidgetService,
    },
  ],
})
export class VeronaWidget implements AfterViewInit {
  readonly metadataSelector = input.required<string>();

  readonly contentRef = contentChild.required('content', { read: TemplateRef });

  readonly document = inject(DOCUMENT);
  readonly service = inject(IFrameVeronaWidgetService);

  protected readonly JSON = JSON;

  ngAfterViewInit() {
    // Send ready-event when component is initialized
    const metadataSelector = this.metadataSelector();
    const metadataElement = this.document.querySelector(metadataSelector);
    if (metadataElement) {
      const metadataJson = metadataElement.textContent;
      const metadata = JSON.parse(metadataJson) as VeronaModuleMetadata;
      this.service.sendReady(metadata);
    } else {
      console.error('Missing metadata element:', metadataSelector);
    }
  }
}

import { inject, Injectable, InjectionToken, Provider } from '@angular/core';
import { MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';

export interface CustomIcons {
  readonly namespace: string;
  readonly svg: string;
}

const CUSTOM_ICONS = new InjectionToken<ReadonlyArray<CustomIcons>>('CustomIcons');

export function registerCustomIcons(customIcons: ReadonlyArray<CustomIcons>): Array<Provider> {
  return [CustomIconsService, { provide: CUSTOM_ICONS, useValue: customIcons }];
}

@Injectable()
export class CustomIconsService {
  private readonly customIcons = inject(CUSTOM_ICONS);
  private readonly domSanitizer = inject(DomSanitizer);
  private readonly iconRegistry = inject(MatIconRegistry);

  registerIcons() {
    for (const { namespace, svg } of this.customIcons) {
      const safeSvg = this.domSanitizer.bypassSecurityTrustHtml(svg);
      this.iconRegistry.addSvgIconSetLiteralInNamespace(namespace, safeSvg);
    }
  }
}

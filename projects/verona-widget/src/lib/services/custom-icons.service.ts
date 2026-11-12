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

// Icon sets already added to a registry; the registry appends a set each time it is added
const REGISTERED_ICONS = new WeakMap<MatIconRegistry, Set<string>>();

@Injectable()
export class CustomIconsService {
  private readonly customIcons = inject(CUSTOM_ICONS);
  private readonly iconRegistry = inject(MatIconRegistry);
  private readonly domSanitizer = inject(DomSanitizer);

  registerIcons() {
    let registered = REGISTERED_ICONS.get(this.iconRegistry);
    if (registered === undefined) {
      registered = new Set<string>();
      REGISTERED_ICONS.set(this.iconRegistry, registered);
    }

    for (const { namespace, svg } of this.customIcons) {
      const key = `${namespace}:${svg}`;
      if (registered.has(key)) continue;
      registered.add(key);

      const safeSvg = this.domSanitizer.bypassSecurityTrustHtml(svg);
      this.iconRegistry.addSvgIconSetLiteralInNamespace(namespace, safeSvg);
    }
  }
}

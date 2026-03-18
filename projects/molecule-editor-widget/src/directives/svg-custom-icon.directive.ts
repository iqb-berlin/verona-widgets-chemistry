import { Directive, effect, ElementRef, inject, input } from '@angular/core';
import { MatIconRegistry } from '@angular/material/icon';
import { take } from 'rxjs';
import { copySvgIconToSymbol } from '../util/svg-icon-symbol';

/** Directive to copy a custom SVG icon from the MatIconRegistry into a <symbol> element */
@Directive({ selector: 'symbol[appCustomSvgIcon]' })
export class SvgCustomIconDirective {
  private readonly registry = inject(MatIconRegistry);

  readonly appCustomSvgIcon = input.required<string>();
  readonly iconNamespace = input<string>('');

  constructor(elementRef: ElementRef<SVGSymbolElement>) {
    effect(() => {
      const iconName = this.appCustomSvgIcon();
      const iconNamespace = this.iconNamespace();
      const symbolElement = elementRef.nativeElement;

      this.registry
        .getNamedSvgIcon(iconName, iconNamespace)
        .pipe(take(1))
        .subscribe({
          next(svgElement) {
            copySvgIconToSymbol(svgElement, symbolElement);
          },
          error(error) {
            console.error(`SvgCustomIconDirective[${iconNamespace}] error:`, error);
          },
        });
    });
  }
}

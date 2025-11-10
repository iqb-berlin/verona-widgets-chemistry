import {Component, inject} from '@angular/core';
import {PsElement, PsElements} from '../../data/PsData';
import {PsTableElement} from '../ps-table-element/ps-table-element';
import {PsService} from '../../services/ps-service';

@Component({
  selector: 'lib-ps-table',
  imports: [
    PsTableElement
  ],
  templateUrl: './ps-table.html',
  styleUrl: './ps-table.scss',
})
export class PsTable {
  readonly service = inject(PsService);
  readonly elements = PsElements

  protected elementClassNames(element: PsElement): ReadonlyArray<string> {
    return [
      `g${element.group}`, // Group "g1" - "g20"
      `p${element.period}`, // Period "p1" - "p7"
      `c${element.column}`, // Column "c1" - "c32"
      `b-${element.block}`, // Block "b-s", "b-p", "b-d", "b-f", "b-g"
    ]
  }
}

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EditorControls } from './editor-controls';

describe('EditorControls', () => {
  let component: EditorControls;
  let fixture: ComponentFixture<EditorControls>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EditorControls]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EditorControls);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

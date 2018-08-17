import { TestBed, async, inject } from '@angular/core/testing';

import { MonzoGuard } from './monzo.guard';

describe('MonzoGuard', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [MonzoGuard]
    });
  });

  it('should ...', inject([MonzoGuard], (guard: MonzoGuard) => {
    expect(guard).toBeTruthy();
  }));
});

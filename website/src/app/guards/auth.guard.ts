import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot, ActivatedRoute } from '@angular/router';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {

  canActivate(next: ActivatedRouteSnapshot): boolean {
    const expectedKeys = ['code', 'state'];
    const keys = Object.keys(next.queryParams);
    // Ensure that every expected key exists in the query param
    // Yes I know JSON schema exists, no Thomas I'm feeling lazy
    const valid = keys.every((key) => expectedKeys.findIndex((expected) => expected === key) !== -1);
    if (valid === false) {
      console.error('params', keys, 'does not match what is expected from a monzo redirect');
    }
    return valid;
  }
}

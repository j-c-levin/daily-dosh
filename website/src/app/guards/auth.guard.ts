import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot, ActivatedRoute } from '@angular/router';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {

  constructor(private activatedRoute: ActivatedRoute) { }

  canActivate(
    next: ActivatedRouteSnapshot,
    state: RouterStateSnapshot): boolean {
    const expectedKeys = ['code', 'state'];
    const valid = Object.keys(this.activatedRoute.params) === expectedKeys;
    if (valid === false) {
      console.error('params', Object.keys(this.activatedRoute.params), 'does not match what is expected from a monzo redirect');
    }
    return valid;
  }
}

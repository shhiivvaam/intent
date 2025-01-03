import { ModuleRef } from '@nestjs/core';
import { MiddlewareConfigurator } from './configurator';
import { IntentMiddleware } from './middleware';
import { ControllerScanner } from '../controller-scanner';
import { Type } from '../../../interfaces/utils';

export class MiddlewareComposer {
  private middlewareRoute = new Map<string, IntentMiddleware[]>();
  private excludedMiddlewareRoutes = new Map<string, string[]>();

  constructor(
    private moduleRef: ModuleRef,
    private middlewareConfigurator: MiddlewareConfigurator,
    private middlewares: Type<IntentMiddleware>[],
  ) {}

  async globalMiddlewares(): Promise<IntentMiddleware[]> {
    const globalMiddlewares = [];
    for (const middleware of this.middlewares) {
      globalMiddlewares.push(await this.moduleRef.create(middleware));
    }
    return globalMiddlewares;
  }

  async getRouteMiddlewares(): Promise<Map<string, IntentMiddleware[]>> {
    /**
     * Prepares a map like
     *
     * "GET:/route" => Middleware Collection
     * "*:/route" => Middleware Collection
     */
    for (const rule of this.middlewareConfigurator.getAllRules()) {
      for (const excludedPath of rule.excludedFor) {
        if (
          typeof excludedPath === 'object' &&
          excludedPath.path &&
          excludedPath.method
        ) {
          this.excludeMiddlewareForRoute(
            `${excludedPath.method}:${excludedPath.path}`,
            rule.middleware,
          );
        } else if (typeof excludedPath === 'string') {
          await this.excludeMiddlewareForRoute(
            `*:${excludedPath}`,
            rule.middleware,
          );
        }
      }
    }

    for (const rule of this.middlewareConfigurator.getAllRules()) {
      for (const appliedFor of rule.appliedFor) {
        if (typeof appliedFor === 'string') {
          await this.setMiddlewareForRoute(appliedFor, '*', rule.middleware);
        } else if (typeof appliedFor === 'object' && appliedFor.path) {
          this.setMiddlewareForRoute(
            appliedFor.path,
            appliedFor.method,
            rule.middleware,
          );
        } else {
          const routes = new ControllerScanner().handle(
            appliedFor as Type<any>,
          );
          for (const route of routes) {
            this.setMiddlewareForRoute(
              route.path,
              route.method || '*',
              rule.middleware,
            );
          }
        }
      }
    }

    return this.middlewareRoute;
  }

  async getExcludedMiddlewaresForRoutes(): Promise<Map<string, string[]>> {
    return this.excludedMiddlewareRoutes;
  }

  async excludeMiddlewareForRoute(
    routeKey: string,
    middleware: Type<IntentMiddleware>,
  ) {
    const existingMiddlewares = this.excludedMiddlewareRoutes.get(
      routeKey,
    ) as any[];
    if (existingMiddlewares) {
      this.excludedMiddlewareRoutes.set(
        routeKey,
        existingMiddlewares.concat(middleware.name),
      );
      return;
    }

    this.excludedMiddlewareRoutes.set(routeKey, [middleware.name]);
  }

  async setMiddlewareForRoute(
    routePath: string,
    routeMethod: string,
    middleware: Type<IntentMiddleware>,
  ) {
    const routeKey = `${routeMethod}:${routePath}`;

    /**
     * Check if the middleware is excluded for the specified route
     */
    const excludedMiddlewareNames =
      this.excludedMiddlewareRoutes.get(routeKey) || [];
    const excludedMiddlewareNamesWithoutMethod =
      this.excludedMiddlewareRoutes.get(`*:${routePath}`) || [];

    const excludedMiddlewares = new Set([
      ...excludedMiddlewareNames,
      ...excludedMiddlewareNamesWithoutMethod,
    ]);

    if (excludedMiddlewares.has(middleware.name)) return;

    const existingMiddlewares = this.middlewareRoute.get(routeKey) as any[];
    if (existingMiddlewares) {
      const middlewareInstance = await this.moduleRef.create(middleware);
      this.middlewareRoute.set(
        routeKey,
        existingMiddlewares.concat(middlewareInstance),
      );
      return;
    }

    const middlewareInstance = await this.moduleRef.create(middleware);
    this.middlewareRoute.set(routeKey, [middlewareInstance]);
  }
}

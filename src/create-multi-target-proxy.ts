import {check} from '@augment-vir/assert';
import {
    getObjectTypedKeys,
    type AnyFunction,
    type AnyObject,
    type PartialWithUndefined,
} from '@augment-vir/common';
import {type RequireExactlyOne} from 'type-fest';
import {createPrioritizedProperties} from './prioritized-properties.js';

/**
 * Options for creating a new proxy wrapper.
 *
 * @category Internal
 */
export type CreateProxyOptions<ProxyType> = {
    /**
     * Indicates if this proxy is meant to be callable, or, in other words, if this proxy is meant
     * to proxy a function rather than just an object.
     */
    isCallable: boolean;
    /**
     * Indicates if the proxy should not be extensible. By default they are extensible, so set this
     * to true to change that behavior. Read JavaScript docs for "Object.isExtensible()" to
     * understand what being extensible means:
     * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/isExtensible
     */
    isNotExtensible: boolean;
} & RequireExactlyOne<{
    /** Initial Target to wrap */
    initialTarget: Partial<ProxyType>;
    /** Initial Targets to wrap, in priority order */
    initialTargets: ReadonlyArray<Partial<ProxyType>>;
}>;

/**
 * Base type for a proxy target.
 *
 * @category Internal
 */
export type ProxyTypeBase = AnyObject | AnyFunction;

/**
 * An interface for modifying a proxy after the fact.
 *
 * @category Main
 */
export type MultiTargetProxyModifier<ProxyType extends ProxyTypeBase> = {
    /**
     * Add a target to the internal list of prioritized targets. Since this will be a fallback
     * target, a property from this target will only be used if no previously added target already
     * has the property.
     */
    addFallbackTarget(target: Partial<ProxyType>): void;
    /**
     * Add a target to the internal list of prioritized targets. Since this will be an override
     * target, a property from this target will always be used unless a new override target with the
     * same property is added or if the properties are modified on the proxy itself.
     */
    addOverrideTarget(target: Partial<ProxyType>): void;
    /** Remove the given target from the internal list of prioritized targets. */
    removeTarget(target: Partial<ProxyType>): boolean;
    /**
     * Get a list of all internal targets, in priority order. This is mostly only useful for
     * debugging purposes.
     */
    getAllTargets(): ReadonlyArray<Partial<ProxyType>>;
    /**
     * Add a new proxy handler. Since this will be an override handler, a method from this handler
     * will always be used unless a new override handler with the same method is added or if the
     * methods are modified on the handler object itself.
     */
    addProxyHandlerOverride(handlerOverride: ProxyHandler<ProxyType>): void;
    /**
     * Add a new proxy handler. Since this will be a fallback handler, a method from this handler
     * will only be used if no previously added override already has the method.
     */
    addProxyHandlerFallback(handlerOverride: ProxyHandler<ProxyType>): void;
    /** Remove the given proxy handler override from the internal list of proxy handler overrides. */
    removeProxyOverride(handlerOverride: ProxyHandler<ProxyType>): boolean;
};

/**
 * A proxy wrapper which allows performing multiple operations on the proxy to modify it after the
 * fact (with `.proxyModifier`), such as merging multiple proxies together or adding new proxy
 * handler methods.
 *
 * @category Main
 */
export type WrappedMultiTargetProxy<ProxyType extends ProxyTypeBase> = {
    proxy: ProxyType;
    proxyModifier: MultiTargetProxyModifier<ProxyType>;
};

/**
 * Create an instance of {@link WrappedMultiTargetProxy} which can be used to merge multiple targets
 * together or override proxy handler methods.
 *
 * @category Main
 * @example
 *
 * ```ts
 * import {createWrappedMultiTargetProxy} from 'proxy-vir';
 *
 * // something you imported from a 3rd party library that you want to wrap
 * const importedThing = {
 *     doThingA() {},
 * };
 *
 * const thingWrapper = createWrappedMultiTargetProxy({
 *     initialTarget: importedThing,
 * });
 *
 * // add a new override
 * thingWrapper.proxyModifier.addOverrideTarget({
 *     doThingA() {},
 * });
 * ```
 */
export function createWrappedMultiTargetProxy<ProxyType extends ProxyTypeBase>(
    options?: PartialWithUndefined<CreateProxyOptions<ProxyType>> | undefined,
): WrappedMultiTargetProxy<ProxyType> {
    /** This target will always be used first. */
    const primaryTarget: any = options?.isCallable ? () => {} : {};

    const deletedProperties = new Set<PropertyKey>();

    let prototype = Object.getPrototypeOf(primaryTarget);

    let isExtensible = !options?.isNotExtensible;

    const proxyOverrides = createPrioritizedProperties<ProxyHandler<ProxyType>>();

    const targetProperties = createPrioritizedProperties<ProxyType>({
        initialList: [primaryTarget],
        /** This is set to 1 so that the primaryTarget above is never overridden. */
        overrideEntryPoint: 1,
        updateCallback(combinedObject) {
            Object.setPrototypeOf(combinedObject, prototype);
            deletedProperties.forEach((property) => {
                delete (combinedObject as AnyObject)[property];
            });
            if (!isExtensible && Object.isExtensible(combinedObject)) {
                Object.preventExtensions(combinedObject);
            }
        },
    });

    const functionHandlers = options?.isCallable
        ? {
              apply() {
                  if (proxyOverrides.combinedProperties.apply) {
                      // eslint-disable-next-line @typescript-eslint/unbound-method
                      return proxyOverrides.combinedProperties.apply;
                  }
                  const firstCallableTarget =
                      targetProperties
                          .getCurrentList()
                          .find((target: unknown) => typeof target === 'function') ?? primaryTarget;

                  return firstCallableTarget();
              },
          }
        : {};

    const createdProxy = new Proxy<any>(targetProperties.combinedProperties, {
        ...functionHandlers,
        defineProperty(combinedTargets, property, attributes) {
            if (proxyOverrides.combinedProperties.defineProperty) {
                return proxyOverrides.combinedProperties.defineProperty(
                    combinedTargets,
                    property,
                    attributes,
                );
            }
            if (!isExtensible) {
                return false;
            }
            deletedProperties.delete(property);
            Object.defineProperty(primaryTarget, property, attributes);
            targetProperties.forceUpdate();
            return true;
        },
        deleteProperty(combinedTargets, property) {
            if (proxyOverrides.combinedProperties.deleteProperty) {
                return proxyOverrides.combinedProperties.deleteProperty(combinedTargets, property);
            }
            if (!isExtensible) {
                return false;
            }
            deletedProperties.add(property);
            return true;
        },
        get(combinedTargets, property, receiver) {
            if (proxyOverrides.combinedProperties.get) {
                return proxyOverrides.combinedProperties.get(combinedTargets, property, receiver);
            }
            if (deletedProperties.has(property)) {
                return undefined;
            }

            return combinedTargets[property];
        },
        getOwnPropertyDescriptor(combinedTargets, property) {
            if (proxyOverrides.combinedProperties.getOwnPropertyDescriptor) {
                return proxyOverrides.combinedProperties.getOwnPropertyDescriptor(
                    combinedTargets,
                    property,
                );
            }
            if (deletedProperties.has(property)) {
                return undefined;
            }

            return Object.getOwnPropertyDescriptor(combinedTargets, property);
        },
        getPrototypeOf(combinedTargets) {
            if (proxyOverrides.combinedProperties.getPrototypeOf) {
                return proxyOverrides.combinedProperties.getPrototypeOf(combinedTargets);
            }
            return Object.getPrototypeOf(combinedTargets);
        },
        has(combinedTargets, property) {
            if (proxyOverrides.combinedProperties.has) {
                return proxyOverrides.combinedProperties.has(combinedTargets, property);
            }
            if (deletedProperties.has(property)) {
                return false;
            }
            return check.hasKey(combinedTargets, property);
        },
        isExtensible(combinedTargets) {
            if (proxyOverrides.combinedProperties.isExtensible) {
                return proxyOverrides.combinedProperties.isExtensible(combinedTargets);
            }
            return isExtensible;
        },
        ownKeys(combinedTargets) {
            if (proxyOverrides.combinedProperties.ownKeys) {
                return proxyOverrides.combinedProperties.ownKeys(combinedTargets);
            }
            return Array.from(getObjectTypedKeys(combinedTargets))
                .map((key): string | symbol => {
                    return typeof key === 'number' ? String(key) : key;
                })
                .filter((property) => !deletedProperties.has(property));
        },
        preventExtensions(combinedTargets) {
            if (proxyOverrides.combinedProperties.preventExtensions) {
                return proxyOverrides.combinedProperties.preventExtensions(combinedTargets);
            }
            isExtensible = false;
            targetProperties.forceUpdate();
            return true;
        },
        set(combinedTargets, property, newValue, receiver) {
            if (proxyOverrides.combinedProperties.set) {
                return proxyOverrides.combinedProperties.set(
                    combinedTargets,
                    property,
                    newValue,
                    receiver,
                );
            }
            if (!isExtensible) {
                return false;
            }

            deletedProperties.delete(property);
            primaryTarget[property] = newValue;
            targetProperties.forceUpdate();

            return true;
        },
        setPrototypeOf(combinedTargets, newPrototype) {
            if (proxyOverrides.combinedProperties.setPrototypeOf) {
                return proxyOverrides.combinedProperties.setPrototypeOf(
                    combinedTargets,
                    newPrototype,
                );
            }
            if (!isExtensible) {
                return false;
            }

            prototype = newPrototype;
            targetProperties.forceUpdate();

            return true;
        },
    });

    const proxyModifier: MultiTargetProxyModifier<ProxyType> = {
        addFallbackTarget(target) {
            targetProperties.addFallback(target);
        },
        addOverrideTarget(target) {
            targetProperties.addOverride(target);
        },
        removeTarget(target) {
            return targetProperties.removeEntry(target);
        },
        addProxyHandlerOverride(handlerOverride) {
            proxyOverrides.addOverride(handlerOverride);
        },
        addProxyHandlerFallback(handlerOverride) {
            proxyOverrides.addFallback(handlerOverride);
        },
        removeProxyOverride(handlerOverride) {
            return proxyOverrides.removeEntry(handlerOverride);
        },
        getAllTargets() {
            return targetProperties.getCurrentList();
        },
    };

    if (options && 'initialTarget' in options && options.initialTarget) {
        proxyModifier.addFallbackTarget(options.initialTarget);
    } else if (options && 'initialTargets' in options && options.initialTargets) {
        options.initialTargets.forEach((initialTarget) => {
            proxyModifier.addOverrideTarget(initialTarget);
        });
    }

    return {
        proxy: createdProxy,
        proxyModifier,
    };
}

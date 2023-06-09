import {getObjectTypedKeys, PartialAndUndefined, typedHasProperty} from '@augment-vir/common';
import {RequireExactlyOne} from 'type-fest';
import {createPrioritizedProperties} from '../prioritized-properties';

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

export type ProxyTypeBase = object | Function;

export type MultiTargetProxyModifier<ProxyType extends ProxyTypeBase> = {
    addFallbackTarget(target: Partial<ProxyType>): void;
    addOverrideTarget(target: Partial<ProxyType>): void;
    removeTarget(target: Partial<ProxyType>): boolean;
    getAllTargets(): ReadonlyArray<unknown>;
    addProxyHandlerOverride(handlerOverride: ProxyHandler<ProxyType>): void;
    addProxyHandlerFallback(handlerOverride: ProxyHandler<ProxyType>): void;
    removeProxyOverride(handlerOverride: ProxyHandler<ProxyType>): boolean;
    getAllTargets(): ReadonlyArray<ProxyType>;
};

export type WrappedMultiTargetProxy<ProxyType extends ProxyTypeBase> = {
    proxy: ProxyType;
    proxyModifier: MultiTargetProxyModifier<ProxyType>;
};

export function createWrappedMultiTargetProxy<ProxyType extends ProxyTypeBase>(
    options?: PartialAndUndefined<CreateProxyOptions<ProxyType>> | undefined,
): WrappedMultiTargetProxy<ProxyType> {
    /** This target will always be used first. */
    const primaryTarget: any = options?.isCallable ? () => {} : {};

    const deletedProperties = new Set<PropertyKey>();

    let prototype = Object.getPrototypeOf(primaryTarget);

    let isExtensible = !options?.isNotExtensible;

    const proxyOverrides = createPrioritizedProperties<ProxyHandler<ProxyType>>();

    const targetProperties = createPrioritizedProperties({
        initialList: [primaryTarget],
        /** This is set to 1 so that the primaryTarget above is never overridden. */
        overrideEntryPoint: 1,
        updateCallback(combinedObject) {
            Object.setPrototypeOf(combinedObject, prototype);
            deletedProperties.forEach((property) => {
                delete combinedObject[property];
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
                      return proxyOverrides.combinedProperties.apply;
                  }
                  const firstCallableTarget =
                      targetProperties
                          .getCurrentList()
                          .find((target) => typeof target === 'function') ?? primaryTarget;

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
            return typedHasProperty(combinedTargets, property);
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
        /**
         * Add a target to the internal list of prioritized targets. Since this will be a fallback
         * target, a property from this target will only be used if no previously added target
         * already has the property.
         */
        addFallbackTarget(target) {
            targetProperties.addFallback(target);
        },
        /**
         * Add a target to the internal list of prioritized targets. Since this will be an override
         * target, a property from this target will always be used unless a new override target with
         * the same property is added or if the properties are modified on the proxy itself.
         */
        addOverrideTarget(target) {
            targetProperties.addOverride(target);
        },
        /** Remove the given target from the internal list of prioritized targets. */
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
        /**
         * The list of internal prioritized targets, in priority order. This is mostly only useful
         * for debugging purposes.
         */
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

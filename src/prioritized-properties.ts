import {
    PartialAndUndefined,
    PropertyValueType,
    getObjectTypedKeys,
    typedHasProperty,
} from '@augment-vir/common';

export type PriorityListInputs<EntryType> = {
    initialList: ReadonlyArray<EntryType>;
    overrideEntryPoint: number;
    updateCallback?: (combined: EntryType) => void;
};

function listToMapInit<EntryType>(
    options?: Pick<PartialAndUndefined<PriorityListInputs<EntryType>>, 'initialList'>,
) {
    if (options?.initialList) {
        return options.initialList
            .map((initialEntry) => {
                return getObjectTypedKeys(initialEntry).map(
                    (key): [PropertyKey, PropertyValueType<EntryType>] => {
                        return [
                            key,
                            initialEntry[key],
                        ];
                    },
                );
            })
            .flat();
    }

    return [];
}

/**
 * Stores and allows updating of a list of entries from which a single object created. Properties
 * for the single object are chosen from the entries by the entry order in the list.
 */
export function createPrioritizedProperties<EntryType>(
    options?: PartialAndUndefined<PriorityListInputs<EntryType>>,
) {
    const list: EntryType[] = [...(options?.initialList ?? [])];

    const combinedProperties: EntryType = Object.fromEntries(listToMapInit(options)) as any;

    function updateObject() {
        // clear out all the object's current keys
        getObjectTypedKeys(combinedProperties).forEach((property) => {
            delete combinedProperties[property];
        });

        list.forEach((entry) => {
            getObjectTypedKeys(entry).forEach((property) => {
                // only save the property if it hasn't been saved already
                if (!typedHasProperty(combinedProperties, property)) {
                    (combinedProperties as any)[property] = entry[property];
                }
            });
        });

        options?.updateCallback?.(combinedProperties);
    }

    return {
        /**
         * An object containing all properties combined from the current priority list of entries.
         * This reference never changes, just its contents, so you are safe to grab and use this
         * object directly.
         */
        combinedProperties,
        addOverride(entry: EntryType) {
            list.splice(options?.overrideEntryPoint ?? 0, 0, entry);
            updateObject();
        },
        addFallback(entry: EntryType) {
            list.push(entry);
            updateObject();
        },
        /** Return value indicates if the given entry was removed or not. */
        removeEntry(entry: EntryType): boolean {
            const entryIndex = list.indexOf(entry);

            if (entryIndex === -1) {
                return false;
            }
            list.splice(entryIndex, 1);
            updateObject();
            return true;
        },
        forceUpdate() {
            updateObject();
        },
        getCurrentList(): ReadonlyArray<EntryType> {
            return [...list];
        },
    };
}

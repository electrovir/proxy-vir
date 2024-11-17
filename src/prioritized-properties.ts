import {check} from '@augment-vir/assert';
import {getObjectTypedKeys, type PartialWithUndefined, type Values} from '@augment-vir/common';

export type PriorityListInputs<EntryType> = {
    initialList: ReadonlyArray<EntryType>;
    overrideEntryPoint: number;
    updateCallback?: (combined: EntryType) => void;
};

function listToMapInit<EntryType>(
    options?: Pick<PartialWithUndefined<PriorityListInputs<EntryType>>, 'initialList'>,
) {
    if (options?.initialList) {
        return options.initialList.flatMap((initialEntry) => {
            return getObjectTypedKeys(initialEntry).map((key) => {
                return [
                    key,
                    initialEntry[key],
                ] as [PropertyKey, Values<EntryType>];
            });
        });
    }

    return [];
}

/**
 * Stores and allows updating of a list of entries from which a single object is created. Properties
 * for the single object are chosen from the entries by the entry order in the list.
 */
export function createPrioritizedProperties<EntryType>(
    options?: PartialWithUndefined<PriorityListInputs<EntryType>>,
) {
    const list: Partial<EntryType>[] = [...(options?.initialList ?? [])];

    const combinedProperties: EntryType = Object.fromEntries(listToMapInit(options)) as any;

    function updateObject() {
        // clear out all the object's current keys
        getObjectTypedKeys(combinedProperties).forEach((property) => {
            delete combinedProperties[property];
        });

        list.forEach((entry) => {
            getObjectTypedKeys(entry).forEach((property) => {
                // only save the property if it hasn't been saved already
                if (!check.hasKey(combinedProperties, property)) {
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
        addOverride(entry: Partial<EntryType>) {
            list.splice(options?.overrideEntryPoint ?? 0, 0, entry);
            updateObject();
        },
        addFallback(entry: Partial<EntryType>) {
            list.push(entry);
            updateObject();
        },
        /** Return value indicates if the given entry was removed or not. */
        removeEntry(entry: Partial<EntryType>): boolean {
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
        getCurrentList(): ReadonlyArray<Partial<EntryType>> {
            return [...list];
        },
    };
}

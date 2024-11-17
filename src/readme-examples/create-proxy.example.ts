import {createWrappedMultiTargetProxy} from '../index.js';

// something you imported from a 3rd party library that you want to wrap
const importedThing = {
    doThingA() {},
};

const thingWrapper = createWrappedMultiTargetProxy({
    initialTarget: importedThing,
});

// add a new override
thingWrapper.proxyModifier.addOverrideTarget({
    doThingA() {},
});

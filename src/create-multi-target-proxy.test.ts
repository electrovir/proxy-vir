import {assert} from '@augment-vir/assert';
import {describe, it} from '@augment-vir/test';
import {createWrappedMultiTargetProxy} from './create-multi-target-proxy.js';

describe(createWrappedMultiTargetProxy.name, () => {
    const exampleInitialTarget = {
        a: 'here',
        b: 'there',
        c: 'who',
        d: 'symmetrical',
    };

    it('has proper types', () => {
        assert
            .tsType(
                createWrappedMultiTargetProxy({
                    initialTarget: exampleInitialTarget,
                }).proxy,
            )
            .equals(exampleInitialTarget);
    });

    it('handles new fallback targets', () => {
        const myProxy = createWrappedMultiTargetProxy<typeof exampleInitialTarget>({
            initialTarget: {a: ''},
        });

        myProxy.proxyModifier.addFallbackTarget({b: 'yo'});

        assert.isDefined(myProxy.proxy.a);
        assert.isDefined(myProxy.proxy.b);
        assert.isUndefined(myProxy.proxy.c);
        assert.isUndefined(myProxy.proxy.d);
    });

    it('handles new override targets', () => {
        const myProxy = createWrappedMultiTargetProxy<typeof exampleInitialTarget>({
            initialTarget: {a: ''},
        });

        const override = {a: 'yo'};

        myProxy.proxyModifier.addOverrideTarget(override);

        assert.isDefined(myProxy.proxy.a);
        assert.isUndefined(myProxy.proxy.b);
        assert.isUndefined(myProxy.proxy.c);
        assert.isUndefined(myProxy.proxy.d);
        assert.strictEquals(myProxy.proxy.a, override.a);
    });

    it('handles proxy overrides', () => {
        const myProxy = createWrappedMultiTargetProxy<typeof exampleInitialTarget>({
            initialTarget: {a: ''},
        });

        const dummyValue = {} as any;

        myProxy.proxyModifier.addProxyHandlerOverride({
            get() {
                return dummyValue;
            },
        });

        assert.strictEquals(myProxy.proxy.a, dummyValue);
        assert.strictEquals(myProxy.proxy.b, dummyValue);
        assert.strictEquals(myProxy.proxy.c, dummyValue);
        assert.strictEquals(myProxy.proxy.d, dummyValue);
    });
});

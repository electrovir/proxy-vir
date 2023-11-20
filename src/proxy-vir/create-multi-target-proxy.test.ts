import {assert} from '@open-wc/testing';
import {assertTypeOf} from 'run-time-assertions';
import {createWrappedMultiTargetProxy} from './create-multi-target-proxy';

describe(createWrappedMultiTargetProxy.name, () => {
    const exampleInitialTarget = {
        a: 'here',
        b: 'there',
        c: 'who',
        d: 'symmetrical',
    };

    it('has proper types', () => {
        assertTypeOf(
            createWrappedMultiTargetProxy({
                initialTarget: exampleInitialTarget,
            }).proxy,
        ).toEqualTypeOf(exampleInitialTarget);
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
        assert.strictEqual(myProxy.proxy.a, override.a);
    });

    it('handles proxy overrides', () => {
        const myProxy = createWrappedMultiTargetProxy<typeof exampleInitialTarget>({
            initialTarget: {a: ''},
        });

        const dummyValue = {};

        myProxy.proxyModifier.addProxyHandlerOverride({
            get() {
                return dummyValue;
            },
        });

        assert.strictEqual(myProxy.proxy.a, dummyValue);
        assert.strictEqual(myProxy.proxy.b, dummyValue);
        assert.strictEqual(myProxy.proxy.c, dummyValue);
        assert.strictEqual(myProxy.proxy.d, dummyValue);
    });
});

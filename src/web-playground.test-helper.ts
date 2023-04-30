import {createWrappedMultiTargetProxy} from './proxy-vir/create-multi-target-proxy';

(window as any)[createWrappedMultiTargetProxy.name] = createWrappedMultiTargetProxy;

const myProxy = createWrappedMultiTargetProxy<any>({
    initialTarget: {a: ''},
});

myProxy.proxyModifier.addFallbackTarget({b: 'yo'});

console.log(myProxy.proxy);

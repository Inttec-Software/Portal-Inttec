module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Use loose module transforms so Metro HMR can hot-reload modules on web.
    // Without loose:true, Babel generates Object.defineProperty(exports,"default",{...})
    // without configurable:true, which throws "Cannot redefine property: default"
    // when Metro tries to update the module during hot reload.
    plugins: [
      ['@babel/plugin-transform-modules-commonjs', { loose: true, allowTopLevelThis: true }],
    ],
  };
};

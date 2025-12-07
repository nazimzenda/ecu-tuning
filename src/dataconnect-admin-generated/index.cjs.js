const { validateAdminArgs } = require('firebase-admin/data-connect');

const connectorConfig = {
  connector: 'example',
  serviceId: 'myapp',
  location: 'us-east4'
};
exports.connectorConfig = connectorConfig;

function createNewVehicle(dcOrVarsOrOptions, varsOrOptions, options) {
  const { dc: dcInstance, vars: inputVars, options: inputOpts} = validateAdminArgs(connectorConfig, dcOrVarsOrOptions, varsOrOptions, options, true, true);
  dcInstance.useGen(true);
  return dcInstance.executeMutation('CreateNewVehicle', inputVars, inputOpts);
}
exports.createNewVehicle = createNewVehicle;

function getMyVehicles(dcOrOptions, options) {
  const { dc: dcInstance, options: inputOpts} = validateAdminArgs(connectorConfig, dcOrOptions, options, undefined);
  dcInstance.useGen(true);
  return dcInstance.executeQuery('GetMyVehicles', undefined, inputOpts);
}
exports.getMyVehicles = getMyVehicles;

function shareTuneWithUser(dcOrVarsOrOptions, varsOrOptions, options) {
  const { dc: dcInstance, vars: inputVars, options: inputOpts} = validateAdminArgs(connectorConfig, dcOrVarsOrOptions, varsOrOptions, options, true, true);
  dcInstance.useGen(true);
  return dcInstance.executeMutation('ShareTuneWithUser', inputVars, inputOpts);
}
exports.shareTuneWithUser = shareTuneWithUser;

function listPublicTunes(dcOrOptions, options) {
  const { dc: dcInstance, options: inputOpts} = validateAdminArgs(connectorConfig, dcOrOptions, options, undefined);
  dcInstance.useGen(true);
  return dcInstance.executeQuery('ListPublicTunes', undefined, inputOpts);
}
exports.listPublicTunes = listPublicTunes;


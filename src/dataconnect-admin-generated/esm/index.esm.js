import { validateAdminArgs } from 'firebase-admin/data-connect';

export const connectorConfig = {
  connector: 'example',
  serviceId: 'myapp',
  location: 'us-east4'
};

export function createNewVehicle(dcOrVarsOrOptions, varsOrOptions, options) {
  const { dc: dcInstance, vars: inputVars, options: inputOpts} = validateAdminArgs(connectorConfig, dcOrVarsOrOptions, varsOrOptions, options, true, true);
  dcInstance.useGen(true);
  return dcInstance.executeMutation('CreateNewVehicle', inputVars, inputOpts);
}

export function getMyVehicles(dcOrOptions, options) {
  const { dc: dcInstance, options: inputOpts} = validateAdminArgs(connectorConfig, dcOrOptions, options, undefined);
  dcInstance.useGen(true);
  return dcInstance.executeQuery('GetMyVehicles', undefined, inputOpts);
}

export function shareTuneWithUser(dcOrVarsOrOptions, varsOrOptions, options) {
  const { dc: dcInstance, vars: inputVars, options: inputOpts} = validateAdminArgs(connectorConfig, dcOrVarsOrOptions, varsOrOptions, options, true, true);
  dcInstance.useGen(true);
  return dcInstance.executeMutation('ShareTuneWithUser', inputVars, inputOpts);
}

export function listPublicTunes(dcOrOptions, options) {
  const { dc: dcInstance, options: inputOpts} = validateAdminArgs(connectorConfig, dcOrOptions, options, undefined);
  dcInstance.useGen(true);
  return dcInstance.executeQuery('ListPublicTunes', undefined, inputOpts);
}


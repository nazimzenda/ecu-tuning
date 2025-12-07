import { ConnectorConfig, DataConnect, OperationOptions, ExecuteOperationResponse } from 'firebase-admin/data-connect';

export const connectorConfig: ConnectorConfig;

export type TimestampString = string;
export type UUIDString = string;
export type Int64String = string;
export type DateString = string;


export interface Comment_Key {
  id: UUIDString;
  __typename?: 'Comment_Key';
}

export interface CreateNewVehicleData {
  vehicle_insert: Vehicle_Key;
}

export interface CreateNewVehicleVariables {
  make: string;
  model: string;
  year: number;
  engineType: string;
}

export interface GetMyVehiclesData {
  vehicles: ({
    id: UUIDString;
    make: string;
    model: string;
    year: number;
    engineType: string;
  } & Vehicle_Key)[];
}

export interface ListPublicTunesData {
  tunes: ({
    id: UUIDString;
    name: string;
    description?: string | null;
    category?: string | null;
    fileUrl: string;
    uploader?: {
      id: UUIDString;
      displayName: string;
    } & User_Key;
      vehicle?: {
        id: UUIDString;
        make: string;
        model: string;
        year: number;
      } & Vehicle_Key;
  } & Tune_Key)[];
}

export interface ShareTuneWithUserData {
  tuneShare_insert: TuneShare_Key;
}

export interface ShareTuneWithUserVariables {
  tuneId: UUIDString;
  recipientId: UUIDString;
}

export interface TuneShare_Key {
  id: UUIDString;
  __typename?: 'TuneShare_Key';
}

export interface Tune_Key {
  id: UUIDString;
  __typename?: 'Tune_Key';
}

export interface User_Key {
  id: UUIDString;
  __typename?: 'User_Key';
}

export interface Vehicle_Key {
  id: UUIDString;
  __typename?: 'Vehicle_Key';
}

/** Generated Node Admin SDK operation action function for the 'CreateNewVehicle' Mutation. Allow users to execute without passing in DataConnect. */
export function createNewVehicle(dc: DataConnect, vars: CreateNewVehicleVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<CreateNewVehicleData>>;
/** Generated Node Admin SDK operation action function for the 'CreateNewVehicle' Mutation. Allow users to pass in custom DataConnect instances. */
export function createNewVehicle(vars: CreateNewVehicleVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<CreateNewVehicleData>>;

/** Generated Node Admin SDK operation action function for the 'GetMyVehicles' Query. Allow users to execute without passing in DataConnect. */
export function getMyVehicles(dc: DataConnect, options?: OperationOptions): Promise<ExecuteOperationResponse<GetMyVehiclesData>>;
/** Generated Node Admin SDK operation action function for the 'GetMyVehicles' Query. Allow users to pass in custom DataConnect instances. */
export function getMyVehicles(options?: OperationOptions): Promise<ExecuteOperationResponse<GetMyVehiclesData>>;

/** Generated Node Admin SDK operation action function for the 'ShareTuneWithUser' Mutation. Allow users to execute without passing in DataConnect. */
export function shareTuneWithUser(dc: DataConnect, vars: ShareTuneWithUserVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<ShareTuneWithUserData>>;
/** Generated Node Admin SDK operation action function for the 'ShareTuneWithUser' Mutation. Allow users to pass in custom DataConnect instances. */
export function shareTuneWithUser(vars: ShareTuneWithUserVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<ShareTuneWithUserData>>;

/** Generated Node Admin SDK operation action function for the 'ListPublicTunes' Query. Allow users to execute without passing in DataConnect. */
export function listPublicTunes(dc: DataConnect, options?: OperationOptions): Promise<ExecuteOperationResponse<ListPublicTunesData>>;
/** Generated Node Admin SDK operation action function for the 'ListPublicTunes' Query. Allow users to pass in custom DataConnect instances. */
export function listPublicTunes(options?: OperationOptions): Promise<ExecuteOperationResponse<ListPublicTunesData>>;


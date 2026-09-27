export const ALERT_DOMAIN_IDS = [
  "styfi",
  "veyfi",
  "yeth",
  "teams",
  "ybc",
  "dao",
] as const;

export type AlertDomainId = (typeof ALERT_DOMAIN_IDS)[number];
export type ActiveAlertDomainId = Extract<
  AlertDomainId,
  "styfi" | "veyfi" | "yeth" | "teams" | "ybc"
>;
export type DisabledAlertDomainId = Exclude<AlertDomainId, ActiveAlertDomainId>;

export const ALERT_DOMAIN_OBJECT_NAMES = {
  styfi: "alerts:styfi:v1",
  veyfi: "alerts:veyfi:v1",
  yeth: "alerts:yeth:v1",
  teams: "alerts:teams:v2",
  ybc: "alerts:ybc:v2",
} as const satisfies Readonly<Record<ActiveAlertDomainId, string>>;

export type AlertDomainObjectName =
  (typeof ALERT_DOMAIN_OBJECT_NAMES)[ActiveAlertDomainId];

/** Canonical replay boundaries. A new object never adopts another object's cursor. */
export const ALERT_DOMAIN_GENESIS_BLOCKS = {
  styfi: 24_386_915,
  veyfi: 24_386_915,
  yeth: 24_522_098,
  teams: 25_244_861,
  ybc: 25_228_044,
} as const satisfies Readonly<Record<ActiveAlertDomainId, number>>;

export type AlertFamily =
  | "styfi"
  | "styfix"
  | "veyfi"
  | "liquid-locker"
  | "yeth"
  | "teams"
  | "ybc";

export interface ActiveAlertDomainRegistration {
  readonly id: ActiveAlertDomainId;
  readonly status: "active";
  readonly objectName: AlertDomainObjectName;
  readonly genesisBlock: number;
  readonly alertFamilies: readonly AlertFamily[];
}

export interface DisabledAlertDomainRegistration {
  readonly id: DisabledAlertDomainId;
  readonly status: "disabled";
  readonly alertFamilies: readonly [];
}

export type AlertDomainRegistration =
  | ActiveAlertDomainRegistration
  | DisabledAlertDomainRegistration;

const STYFI_REGISTRATION = Object.freeze({
  id: "styfi",
  status: "active",
  objectName: ALERT_DOMAIN_OBJECT_NAMES.styfi,
  genesisBlock: ALERT_DOMAIN_GENESIS_BLOCKS.styfi,
  alertFamilies: Object.freeze(["styfi", "styfix"]),
} satisfies ActiveAlertDomainRegistration);

const VEYFI_REGISTRATION = Object.freeze({
  id: "veyfi",
  status: "active",
  objectName: ALERT_DOMAIN_OBJECT_NAMES.veyfi,
  genesisBlock: ALERT_DOMAIN_GENESIS_BLOCKS.veyfi,
  alertFamilies: Object.freeze(["veyfi", "liquid-locker"]),
} satisfies ActiveAlertDomainRegistration);

const YETH_REGISTRATION = Object.freeze({
  id: "yeth",
  status: "active",
  objectName: ALERT_DOMAIN_OBJECT_NAMES.yeth,
  genesisBlock: ALERT_DOMAIN_GENESIS_BLOCKS.yeth,
  alertFamilies: Object.freeze(["yeth"]),
} satisfies ActiveAlertDomainRegistration);

const TEAMS_REGISTRATION = Object.freeze({
  id: "teams",
  status: "active",
  objectName: ALERT_DOMAIN_OBJECT_NAMES.teams,
  genesisBlock: ALERT_DOMAIN_GENESIS_BLOCKS.teams,
  alertFamilies: Object.freeze(["teams"]),
} satisfies ActiveAlertDomainRegistration);

const YBC_REGISTRATION = Object.freeze({
  id: "ybc",
  status: "active",
  objectName: ALERT_DOMAIN_OBJECT_NAMES.ybc,
  genesisBlock: ALERT_DOMAIN_GENESIS_BLOCKS.ybc,
  alertFamilies: Object.freeze(["ybc"]),
} satisfies ActiveAlertDomainRegistration);

const DAO_REGISTRATION = Object.freeze({
  id: "dao",
  status: "disabled",
  alertFamilies: Object.freeze([]),
} satisfies DisabledAlertDomainRegistration);

export const ACTIVE_ALERT_DOMAIN_REGISTRATIONS = Object.freeze([
  STYFI_REGISTRATION,
  VEYFI_REGISTRATION,
  YETH_REGISTRATION,
  TEAMS_REGISTRATION,
  YBC_REGISTRATION,
] satisfies readonly ActiveAlertDomainRegistration[]);

export const ALERT_DOMAIN_REGISTRATIONS = Object.freeze([
  ...ACTIVE_ALERT_DOMAIN_REGISTRATIONS,
  DAO_REGISTRATION,
] satisfies readonly AlertDomainRegistration[]);

const REGISTRATION_BY_ID: Readonly<Record<AlertDomainId, AlertDomainRegistration>> =
  Object.freeze({
    styfi: STYFI_REGISTRATION,
    veyfi: VEYFI_REGISTRATION,
    yeth: YETH_REGISTRATION,
    teams: TEAMS_REGISTRATION,
    ybc: YBC_REGISTRATION,
    dao: DAO_REGISTRATION,
  });

export function isAlertDomainId(value: unknown): value is AlertDomainId {
  return (
    typeof value === "string" &&
    (ALERT_DOMAIN_IDS as readonly string[]).includes(value)
  );
}

export function isActiveAlertDomainRegistration(
  registration: AlertDomainRegistration,
): registration is ActiveAlertDomainRegistration {
  return registration.status === "active";
}

export function getAlertDomainRegistration(
  domainId: AlertDomainId,
): AlertDomainRegistration {
  return REGISTRATION_BY_ID[domainId];
}

export type RootStackParamList = {
  Tabs: undefined;
  FlightDetail: { flightId: string };
  AddEditFlight: { flightId?: string };
  AirlineWebView: { airlineCode: string };
};

export type TabParamList = {
  Timeline: undefined;
  Settings: undefined;
};

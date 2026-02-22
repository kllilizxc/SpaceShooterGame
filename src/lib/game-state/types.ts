export type State = Record<string, any>;
export type Getters = Record<string, (state: any) => any>;
export type Actions = Record<string, Function>;

export interface Mutation {
    t: number;
    store: string;
    action: string;
    changes: { key: string; old: any; new: any }[];
}

export interface StoreDescriptor<S extends State, G extends Getters, A extends Actions> {
    state: () => S;
    getters?: G & ThisType<S & G>;
    actions?: A & ThisType<S & G & A & {
        $reset: () => void;
        $subscribe: (cb: (mutation: Mutation) => void) => () => void;
    }>;
}


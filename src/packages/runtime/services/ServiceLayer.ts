import { ServiceRepr } from "./ServiceRepr";
import { Error } from "@open-pioneer/core";
import { ErrorId } from "../errors";
import { verifyDependencies } from "./verifyDependencies";
import { BundleRepr } from "./BundleRepr";

export class ServiceLayer {
    readonly serviceIndex: ReadonlyMap<string, ServiceRepr>;
    private allServices: readonly ServiceRepr[];
    private state: "not-started" | "started" | "destroyed" = "not-started";

    constructor(bundles: readonly BundleRepr[]) {
        this.allServices = bundles.map((bundle) => bundle.services).flat();
        this.serviceIndex = verifyDependencies(this.allServices);
    }

    destroy() {
        this.allServices.forEach((value) => {
            this.destroyService(value);
        });
        this.state = "destroyed";
    }

    start() {
        if (this.state !== "not-started") {
            throw new Error(ErrorId.INTERNAL, "Service layer was already started.");
        }

        this.allServices.forEach((value) => {
            this.initService(value);
        });
        this.state = "started";
    }

    /**
     * Initializes the given service and its dependencies.
     * Dependencies are initialized before the service that requires them.
     */
    private initService(service: ServiceRepr) {
        if (service.state === "constructed") {
            const instance = service.getInstanceOrThrow();
            service.addRef();
            return instance;
        }
        if (service.state === "constructing") {
            throw new Error(ErrorId.INTERNAL, "Cycle during service construction.");
        }
        if (service.state !== "not-constructed") {
            throw new Error(ErrorId.INTERNAL, "Invalid service state.");
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const instances: Record<string, any> = {};

        // Sets state to 'constructing' to detect cycles
        service.beforeCreate();

        // Initialize dependencies recursively before creating the current service.
        service.dependencies.forEach((d) => {
            const serviceRef = this.serviceIndex.get(d.interface);
            if (serviceRef) {
                const instance = this.initService(serviceRef);
                instances[d.name] = instance;
            } else {
                throw new Error(ErrorId.INTERNAL, "Service not defined.");
            }
        });
        return service.create({ references: instances, properties: service.properties });
    }

    /**
     * Destroys the given service and its dependencies.
     * The dependencies are destroyed after the service.
     */
    private destroyService(service: ServiceRepr) {
        if (service.state === "destroyed") {
            return;
        }

        // Destroy the service before its dependencies (reverse order
        // compared to construction).
        if (service.removeRef() <= 0) {
            service.destroy();
        }

        service.dependencies.forEach((d) => {
            const serviceRef = this.serviceIndex.get(d.interface);
            if (serviceRef) {
                this.destroyService(serviceRef);
            }
        });
    }
}
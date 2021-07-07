import RpiGpioRts from './RpiGpioRts';
// let Service, Characteristic;

export default homebridge => {
	Service = homebridge.hap.Service;
	Characteristic = homebridge.hap.Characteristic;
	homebridge.registerAccessory('homebridge-rpi-rts-windowcovering', 'Somfy RTS Remote Window Covering', SomfyRtsWindowCoveringAccessory);
};

/**
 * Class simulating a Somfy RTS Remote Accessory for Homebridge
 * with 4 'stateless' switches: Up, Down, My, Prog
 *
 * @class SomfyRtsWindowCoveringAccessory
 */
class SomfyRtsWindowCoveringAccessory {


	constructor(log, config) {
		this.log = log;
		if (!config || !config.name || !config.id) {
			throw new Error(`Invalid or missing configuration.`);
		}
		this.config = config;

		this.emitter = new RpiGpioRts(log, config);
		
		// I need to create a button called "sync"
		// As well as a window covering.

		this.SomfyServices = {
			// 'syncButton': new Service.Switch(`${this.config.name} Synchronise`),
			'windowCovering': new Service.windowCovering(`${this.config.name}`)
		}

		this.SomfyServices.windowCovering.getCharacteristic(Characteristic.CurrentPosition)
			.onGet(this.CoveringPositionGet().bind(this));
		this.SomfyServices.windowCovering.getCharacteristic(Characteristic.PositionState)
			.onGet(this.CoveringPositionStateGet().bind(this));
		this.SomfyServices.windowCovering.getCharacteristic(Characteristic.TargetPosition)
			.onGet(this.CoveringTargetPositionGet().bind(this))
			.onSet(this.CoveringTargetPositionSet().bind(this));
		
		this.log.debug(`Initialized accessory`);
	}
	CoveringPositionGet() {
		this.log.debug('Triggered GET CurrentPosition');

    // set this to a valid value for CurrentPosition
    const currentValue = 1;

    return currentValue;
	}
	CoveringPositionStateGet() {
    this.log.debug('Triggered GET PositionState');

    // set this to a valid value for PositionState
    const currentValue = Characteristic.PositionState.DECREASING;

    return currentValue;
  }
	CoveringTargetPositionGet() {
    this.log.debug('Triggered GET TargetPosition');

    // set this to a valid value for TargetPosition
    const currentValue = 1;

    return currentValue;
  }

  /**
   * Handle requests to set the "Target Position" characteristic
   */
  CoveringTargetPositionSet(value) {
    this.log.debug(`Triggered SET TargetPosition: ${value}`);
  }
	/**
	 * Mandatory method for Homebridge
	 * Return a list of services provided by this accessory
	 *
	 * @method getServices
	 * @return {Array} - An array containing the services
	*/
	getServices() {
		this.log.debug(`Function getServices called`);
		return Object.values(this.SomfyServices);
	}
}

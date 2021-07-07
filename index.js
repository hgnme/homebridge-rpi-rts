const RpiGpioRts = require('./RpiGpioRts');
// let Service, Characteristic;

module.exports = homebridge => {
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
	isSyncing = 0;
	constructor(log, config) {
		this.log = log;
		if (!config || !config.name || !config.id) {
			throw new Error(`Invalid or missing configuration.`);
		}
		this.config = config;

		this.emitter = new RpiGpioRts(log, config);

		this.hasSynced = false;
		this.CoveringPosition = 100;
		this.CoveringTargetPosition = 100;
		this.CoveringMoving = false;
		
		this.SomfyServices = {
			'syncButton': new Service.Switch(`${this.config.name} Synchronise State`),
			'windowCovering': new Service.WindowCovering(`${this.config.name}`)
		}

		this.SomfyServices.windowCovering.getCharacteristic(Characteristic.CurrentPosition)
			.onGet(this.CoveringPositionGet.bind(this));
		this.SomfyServices.windowCovering.getCharacteristic(Characteristic.PositionState)
			.onGet(this.CoveringPositionStateGet.bind(this));
		this.SomfyServices.windowCovering.getCharacteristic(Characteristic.TargetPosition)
			.onGet(this.CoveringTargetPositionGet.bind(this))
			.onSet(this.CoveringTargetPositionSet.bind(this));
		
		this.SomfyServices.syncButton.getCharacteristic(Characteristic.On)
			.onGet(this.SyncroniseStateGet.bind(this))
			.onSet(this.SyncroniseStateSet.bind(this));
		this.log.debug(`Initialized accessory`);
	}
	// Gets whether or not the blind is moving
	CoveringPositionStateGet() {
		if(this.CoveringMoving) {
			if(CoveringPosition < this.CoveringTargetPosition) {
				this.log.debug('Triggered GET PositionState: increasing');
				return Characteristic.PositionState.INCREASING;
			} 
			this.log.debug('Triggered GET PositionState: decreasing');
			return Characteristic.PositionState.DECREASING;
		}
    this.log.debug('Triggered GET PositionState: stopped');
		return Characteristic.PositionState.STOPPED;
  }
	CoveringPositionGet() {
		this.log.debug('Triggered GET CurrentPosition: ' + this.CoveringPosition);

    // set this to a valid value for CurrentPosition
    return this.CoveringPosition;
	}
	CoveringTargetPositionGet() {
    this.log.debug('Triggered GET TargetPosition: ' + this.CoveringTargetPosition);

    return this.CoveringTargetPosition;
  }
	/* returns the time in ms to move the blind */
	CalcOperationLength(targetPosition) {
		let distanceToMove;
		if(targetPosition < this.CoveringPosition) {
			// current 70, target 50, move = 20
			// 20 = 70 - 50
			distanceToMove = this.CoveringPosition - targetPosition;
		} else {
			// 70 current, target 90, move = 20
			// 20 = target - current
			distanceToMove = targetPosition - this.CoveringPosition;
		}
		return (distanceToMove / 100) * this.config.timeToOpen;
	}
  /**
	 * Sets the blind position
	 */
  CoveringTargetPositionSet(value) {
    this.log.debug(`Triggered SET TargetPosition: targ${value} cur${this.CoveringPosition}`);
		if(this.hasSynced === false) {
			// syncronise
			if(this.isSyncing) {
				this.log.debug('already syncing');
				return false;
			}
			this.log.debug('triggering sync');
			this.SomfyServices.syncButton.setCharacteristic(Characteristic.On, true);
			return;
		}
		const distanceToMove = this.CalcOperationLength(value);
		this.log.debug('distance to move (ms): ' + distanceToMove);
		this.CoveringTargetPosition = value;
		const covering = this.SomfyServices.windowCovering;
		covering.updateCharacteristic(Characteristic.TargetPosition, this.CoveringTargetPosition);
		if(this.CoveringPosition > value) {
			// going down
			covering.updateCharacteristic(Characteristic.PositionState, Characteristic.PositionState.DECREASING);
			this.emitter.sendCommand('Down');
		} else {
			covering.updateCharacteristic(Characteristic.PositionState, Characteristic.PositionState.INCREASING);
			this.emitter.sendCommand('Up');

		}
		setTimeout(
			function() {
				const covering = this.SomfyServices.windowCovering;
				covering.updateCharacteristic(Characteristic.PositionState, Characteristic.PositionState.STOPPED);
				this.emitter.sendCommand('My');
				this.log.debug('move complete');
				this.CoveringPosition = value;
				covering.updateCharacteristic(Characteristic.CurrentPosition, this.CoveringPosition);				
			}.bind(this), 
			distanceToMove
		);
  }

	SyncroniseStateGet() {
    this.log.debug('Syncronise btn get' + this.isSyncing);
    return this.isSyncing;
	}
	SyncroniseStateSet(value) {
    this.log.debug('Syncronise btn set: ' + value);
		if(value === true) {
			this.log.debug('Average time:' + this.config.timeToOpen);

			this.CoveringTargetPosition = 100;

			this.CoveringMoving = true;
			this.emitter.sendCommand('Up');
			const covering = this.SomfyServices.windowCovering;
			covering.updateCharacteristic(Characteristic.PositionState, Characteristic.PositionState.INCREASING);
			setTimeout(
				function() {
					this.hasSynced = true;
					this.CoveringMoving = false;
					this.CoveringPosition = this.CoveringTargetPosition;
					this.isSyncing = false;

					this.SomfyServices.syncButton.setCharacteristic(Characteristic.On, false);

					const covering = this.SomfyServices.windowCovering;
					covering.updateCharacteristic(Characteristic.CurrentPosition, this.CoveringPosition);
					covering.updateCharacteristic(Characteristic.PositionState, Characteristic.PositionState.STOPPED);
				}.bind(this), 
				this.config.timeToOpen
			);
		}
		this.isSyncing = value;
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

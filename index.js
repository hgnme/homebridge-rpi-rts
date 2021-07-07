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
		this.CoveringPosition = 50;
		this.CoveringTargetPosition = 50;
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
				return Characteristic.PositionState.INCREASING;
			} 
			return Characteristic.PositionState.DECREASING;
		}
		return Characteristic.PositionState.STOPPED;
  }
	CoveringPositionGet() {
    return this.CoveringPosition;
	}
	CoveringTargetPositionGet() {
    return this.CoveringTargetPosition;
  }
	/* returns the time in ms to move the blind */
	CalcOperationLength(targetPosition) {
		let distanceToMove;
		// 27 curr --> 50 destination --> goign up --> 23
		if(this.CoveringPosition < targetPosition) {
			// Going up
			distanceToMove = targetPosition - this.CoveringPosition;
			return (distanceToMove / 100) * this.config.timeToOpen;
		} else {
			// 50 curr -> 27 destination --> going down --> 23
			// going down
			distanceToMove = this.CoveringPosition - targetPosition;
			return (distanceToMove / 100) * this.config.timeToClose;
		}
	}

	moveCovering() {
		const positionCurrent = this.CoveringPosition;
		const positionTarget = this.CoveringTargetPosition;
		const covering = this.SomfyServices.windowCovering;
		const direction = this.CoveringPosition > this.CoveringTargetPosition ? 'Down' : 'Up';

		const timeToMove = this.CalcOperationLength(positionTarget);

		this.log.debug(`Moving covering (${direction}) for ${timeToMove}ms`);
		// Set target position 
		covering.updateCharacteristic(Characteristic.TargetPosition, positionTarget);
		// Set covering characteristic
		covering.updateCharacteristic(
			Characteristic.PositionState, 
			direction === 'Down' ? Characteristic.PositionState.DECREASING : Characteristic.PositionState.INCREASING
		);

		// Press the button
		this.log.debug(`--> Triggering button press`);
		this.emitter.sendCommand(direction);
		this.CoveringMoving = true;
		// Set timeout of (timeToMove) ms and press My button when at destination
		setTimeout(
			function() {
				this.log.debug(`--> Arrived at destination`);
				this.log.debug(`--> Presing My`);
				this.emitter.sendCommand('My');
				this.CoveringPosition = this.CoveringTargetPosition;
				const covering = this.SomfyServices.windowCovering;
				covering.updateCharacteristic(Characteristic.CurrentPosition, this.CoveringPosition);
				covering.updateCharacteristic(Characteristic.PositionState, Characteristic.PositionState.STOPPED);		
				this.CoveringMoving = false;
				this.log.debug(`--> Move complete`);
			}.bind(this), 
			timeToMove
		);
	}
	syncroniseCovering() {
		this.isSyncing = true;
		this.CoveringTargetPosition = 100;
		this.CoveringMoving = true;
		
		this.log.debug('--> Pressing Up button');
		this.emitter.sendCommand('Up');
		this.CoveringMoving = true;
		const covering = this.SomfyServices.windowCovering;
		// Set blind to 0% and stopped to begin
		
		this.log.debug('--> Closing characteristics');
		covering.updateCharacteristic(Characteristic.PositionState, Characteristic.PositionState.STOPPED);
		covering.updateCharacteristic(Characteristic.CurrentPosition, 0);
		setTimeout(
			// Set blind to rising, 100% target 500ms later
			function() {
				const covering = this.SomfyServices.windowCovering;
				const targPos = this.CoveringTargetPosition;
				this.log.debug('--> Opening characteristics');
				this.log.debug(targPos);
				covering.updateCharacteristic(Characteristic.PositionState, Characteristic.PositionState.INCREASING);
				covering.updateCharacteristic(Characteristic.CoveringTargetPosition, targPos);
			}.bind(this),
			500
		);

		this.log.debug(`--> Waiting ${this.config.timeToOpen} ms`);
		setTimeout(
			function() {
				this.log.debug(`--> Arrived at top`);
				this.hasSynced = true;
				this.CoveringMoving = false;
				this.CoveringPosition = this.CoveringTargetPosition;
				this.isSyncing = false;

				this.log.debug(`--> Turning off Sync button`);
				this.SomfyServices.syncButton.setCharacteristic(Characteristic.On, false);

				this.log.debug(`--> Updating windowCovering status`);
				const covering = this.SomfyServices.windowCovering;
				covering.updateCharacteristic(Characteristic.CurrentPosition, this.CoveringPosition);
				covering.updateCharacteristic(Characteristic.PositionState, Characteristic.PositionState.STOPPED);
				this.CoveringMoving = false;
				this.log.debug(`--> Sync complete`);
			}.bind(this), 
			this.config.timeToOpen
		);
	}
  /**
	 * Sets the blind position
	 */
  CoveringTargetPositionSet(value) {
    this.log.debug(`Requested to move blind to ${value}% from ${this.CoveringPosition}%`);
		// syncronise
		if(this.isSyncing) {
			this.log.debug('Currently Syncing, nothing to do');
			return false;
		}
		if(this.hasSynced === false) {
			this.log.debug('No sync performed yet, nothing to do');
			this.SomfyServices.syncButton.setCharacteristic(Characteristic.On, true);
			return;
		}
		
		// Call moveCovering function
		this.CoveringTargetPosition = value;
		this.moveCovering();
  }

	SyncroniseStateGet() {
    return this.isSyncing;
	}
	SyncroniseStateSet(value) {
		if(value === true) {
			this.log.debug('Beginning syncronise process. Moving to full open');
			this.syncroniseCovering();
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

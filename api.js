/** A SCORM API.
 * It provides the `window.API_1484_11` object, which SCORM packages use to interact with the data model.
 *
 * @param {object} data - A dictionary of the SCORM data model
 * @param {number} attempt_pk - the id of the associated attempt in the database
 * @param {string} fallback_url - URL of the AJAX fallback endpoint
 */
function SCORM_API(options) {
    var data = options.scorm_cmi;
    var sc = this;

    this.callbacks = new CallbackHandler();

    this.attempt_pk = options.attempt_pk;
    this.fallback_url = options.fallback_url;
    this.show_attempts_url = options.show_attempts_url;

    this.allow_review_from = load_date(options.allow_review_from);
    this.available_until = load_date(options.available_until);

    /** A dictionary of batches of elements which have been sent, but we haven't received confirmation that the server has saved them.
     *  Maps batch ids to lists of SCORMElements.
     */
    this.sent = {};
    this.element_acc = 0;

    /** An accumulator for the batch IDs
     */
    this.sent_acc = (new Date()).getTime();

    this.initialise_data(data);

    this.initialise_api();
}
SCORM_API.prototype = {

    /** Has the API been initialised?
     */
	initialized: false,

    /** Has the API been terminated?
     */
	terminated: false,

    /** The code of the last error that was raised
     */
	last_error: 0,

    /** Setup the SCORM data model.
     *  Merge in elements loaded from the page with elements saved to localStorage, taking the most recent value when there's a clash.
     */
    initialise_data: function(data) {
        // create the data model
        this.data = {};
        for(var key in data) {
            this.data[key] = data[key].value;
        }
        
        /** SCORM display mode - 'normal' or 'review'
         */
        this.mode = this.data['cmi.mode'];

        /** Is the client allowed to change data model elements?
         *  Not allowed in review mode.
         */
        this.allow_set = this.mode=='normal';

        // Force review mode from now on if activity is completed - could be out of sync if resuming a session which wasn't saved properly.
        if(this.data['cmi.completion_status'] == 'completed') {
            this.data['cmi.mode'] = this.mode = 'review';
        }

        this.callbacks.trigger('initialise_data');
    },

    /** Initialise the SCORM API and expose it to the SCORM activity
     */
    initialise_api: function() {
        var sc = this;

        /** The API object to expose to the SCORM activity
         */
        this.API_1484_11 = {};
        ['Initialize','Terminate','GetLastError','GetErrorString','GetDiagnostic','GetValue','SetValue','Commit'].forEach(function(fn) {
            sc.API_1484_11[fn] = function() {
                return sc[fn].apply(sc,arguments);
            };
        });

        /** Counts for the various lists in the data model
         */
        this.counts = {
            'comments_from_learner': 0,
            'comments_from_lms': 0,
            'interactions': 0,
            'objectives': 0,
        }
        this.interaction_counts = [];

        /** Set the counts based on the existing data model
         */
        for(var key in this.data) {
            this.check_key_counts_something(key);
        }

        this.callbacks.trigger('initialise_api');
    },

    /** Force the exam to end.
     */
    end: function() {
        this.Terminate('');
        this.ended = true;
    },

    /** For a given data model key, if it belongs to a list, update the counter for that list
     */
    check_key_counts_something: function(key) {
        var m;
        if(m=key.match(/^cmi.(\w+).(\d+)/)) {
            var ckey = m[1];
            var n = parseInt(m[2]);
            this.counts[ckey] = Math.max(n+1, this.counts[ckey]);
            this.data['cmi.'+ckey+'._count'] = this.counts[ckey];
            if(ckey=='interactions' && this.interaction_counts[n]===undefined) {
                this.interaction_counts[n] = {
                    'objectives': 0,
                    'correct_responses': 0
                }
            }
        }
        if(m=key.match(/^cmi.interactions.(\d+).(objectives|correct_responses).(\d+)/)) {
            var n1 = parseInt(m[1]);
            var skey = m[2];
            var n2 = parseInt(m[3]);
            this.interaction_counts[n1][skey] = Math.max(n2+1, this.interaction_counts[n1][skey]);
            this.data['cmi.interactions.'+n1+'.'+skey+'._count'] = this.interaction_counts[n1][skey];
        }
    },

	Initialize: function(b) {
        this.callbacks.trigger('Initialize',b);
        if(b!='' || this.initialized || this.terminated) {
			return false;
		}
		this.initialized = true;
		return true;
	},

	Terminate: function(b) {
        this.callbacks.trigger('Terminate',b);
		if(b!='' || !this.initialized || this.terminated) {
			return false;
		}
		this.terminated = true;

		return true;
	},

	GetLastError: function() {
		return this.last_error;
	},

	GetErrorString: function(code) {
		return "I haven't written any error strings yet.";
	},

	GetDiagnostic: function(code) {
		return "I haven't written any error handling yet.";
	},

	GetValue: function(key) {
		var v = this.data[key];
        if(v===undefined) {
            return '';
        } else {
            return v;
        }
	},

	SetValue: function(key,value) {
        if(!this.allow_set) {
            return;
        }
        value = (value+'');
        var changed = value!=this.data[key];
        if(changed) {
    		this.data[key] = value;
            this.check_key_counts_something(key);
        }
        this.callbacks.trigger('SetValue',key,value,changed);
        return true;
	},

    Commit: function(s) {
        this.callbacks.trigger('Commit');
        return true;
    }
}

function CallbackHandler() {
    this.callbacks = {};
}
CallbackHandler.prototype = {
    on: function(key,fn) {
        if(this.callbacks[key] === undefined) {
            this.callbacks[key] = [];
        }
        this.callbacks[key].push(fn);
    },
    trigger: function(key) {
        if(!this.callbacks[key]) {
            return;
        }
        var args = Array.prototype.slice.call(arguments,1);
        this.callbacks[key].forEach(function(fn) {
            fn.apply(this,args);
        });
    }
}

/** A single SCORM data model element, with the time it was set.
 */
function SCORMData(key,value,time,counter) {
    this.key = key;
    this.value = value;
    this.time = time;
    this.counter = counter;
}
SCORMData.prototype = {
    as_json: function() {
        return {
            key: this.key,
            value: this.value,
            time: this.timestamp(),
            counter: this.counter
        }
    },

    timestamp: function() {
        return this.time.getTime()/1000
    }
}

function load_date(date) {
    if(date!==null) {
        return new Date(date);
    }
}

module.exports = SCORM_API;

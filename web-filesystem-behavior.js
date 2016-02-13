'use strict';

window.FileBehaviors = window.FileBehaviors || {};
/**
 * A base behavior for web filesystem.
 * FileSystem API becomes Chrome specific API since other vendors did not implemented it in
 * their browesers and is no longer being standardized with the W3C.
 *
 * This behavior is a base behavior for `local-` and `sync-` filesystem behaviors.
 *
 * @polymerBehavior
 */
FileBehaviors.WebFilesystemBehavior = {
  /**
   * Fired when a filesystem is ready.
   *
   * @event filesystem-ready
   */
  /**
   * Fired when usage details are ready.
   *
   * @event filesystem-usage
   * @param {Number} usageBytes Number of currently used bytes.
   * @param {Number} quotaBytes Number of bytes granted by the filesystem.
   */
  /**
   * Fired when error occured.
   *
   * @event error
   * @param {Error} error An error object.
   */
  /**
   * Fired when file has been read.
   *
   * @event file-read
   * @param {String} content Content of the file.
   */
  /**
   * Fired when the content has been written to the file.
   *
   * @event file-write
   */
  /**
   * Fired when file has been read.
   *
   * @event directory-read
   * @param {Array<FileEntry>} files List of files in a directory.
   */
  /**
   * Fired when file has been removed.
   *
   * @event removed
   */
  properties: {
    /**
     * If using local filesystem storage quota must be provided.
     * User Agent need to know how many quota the app require.
     *
     * UA may not grant requested amount of disk space if e.g. "quota" is
     * bigger than available space.
     * Number of bytes available for the app is hold in "grantedQuota" attreibute.
     *
     * Note that the app must set quota number > 0 for local FS or it will
     * cause an error during file save.
     *
     * @type Number
     */
    quota: {
      value: 0,
      type: Number
    },
    /**
     * Granted by te user agent number of bytes avaibale to use by the app.
     * It will be filled up when the app already requested filesystem.
     *
     * @type Number
     */
    grantedQuota: {
      type: Number,
      value: 0,
      readOnly: true,
      notify: true
    },
    /**
     * Name of the file.
     *
     * @type String
     */
    filename: {
      type: String,
      observer: '_filenameChanged'
    },
    /**
     * If true the file will be read from the filesystem as soon as
     * filename attribute change.
     *
     * @type Boolean
     */
    auto: {
      type: Boolean,
      value: false
    },
    /**
     * A content of the file.
     * If auto attribute is true it will write content to file each time
     * it change.
     *
     * TODO: add support for other types than String.
     *
     * @type String|ArrayBuffer|Blob
     */
    content: {
      type: Object,
      notify: true,
      observer: '_contentChanged'
    },
    /**
     * File mime-type.
     */
    mime: {
      type: String,
      value: 'text/plain'
    },
    /**
     * A handler to the filesystem.
     * Call `element`.requestFilesystem() to request filesystem and set up the handler.
     */
    fileSystem: {
      type: Object,
      readOnly: true
    }
  },
  /**
   * Request a filesystem.
   */
  requestFilesystem: function() {
    this._requestFilesystem()
      .then(() => {
        this.fire('filesystem-ready');
      })
      .catch((reason) => {
        this.fire('error', {
          'error': reason
        });
      });
  },
  /**
   * An implementation of requesting filesystem.
   * Other behaviors can override this function to request different type of
   * filesystem.
   *
   * @return {Promise} Fulfilled promise when filesystem has been requested. The filesystem
   * reference is in `fileSystem` attribute.
   */
  _requestFilesystem: function() {
    if (this.fileSystem) {
      return Promise.resolve();
    }
    return new Promise(function(resolve, reject) {
      var onInit = function(fs) {
        this._setFileSystem(fs);
        resolve();
      };
      var onError = function(e) {
        reject(e);
      };
      navigator.webkitPersistentStorage.requestQuota(this.quota, function(grantedBytes) {
        this._setGrantedQuota(grantedBytes);
        window.requestFileSystem(window.PERSISTENT, grantedBytes, onInit.bind(this), onError);
      }.bind(this), onError);
    }.bind(this));
  },

  /**
   * Returns the current usage and quota in bytes for the filesystem.
   *
   * @returns {Promise} Promise will result with filesystem status.
   * Object will contain folowing keys:
   *  - usageBytes (integer)
   *  - quotaBytes (integer)
   */
  getUsageAndQuota: function() {
    navigator.webkitPersistentStorage.queryUsageAndQuota(
      function(currentUsageInBytes, currentQuotaInBytes) {
        this.fire('filesystem-usage', {
          'usageBytes': currentUsageInBytes,
          'quotaBytes': currentQuotaInBytes
        });
      }.bind(this),
      function(e) {
        this.fire('error', {
          'messager': e.message
        });
      }.bind(this)
    );
  },
  /**
   * Get a file from the storage.
   *
   * Example:
   *  <web-filesystem id="appFilesystem" file="names.json"></web-filesystem>
   *
   *  this.$.fileSystem.getFile().then(function(fileEntry){});
   *
   * @returns {Promise} Fulfilled promise will result with {FileEntry} object.
   */
  getFile: function() {
    return new Promise((resolve, reject) => {
      this._requestFilesystem()
        .then(() => {
          this.fileSystem.root.getFile(this.filename, {
            create: true
          }, function(fileEntry) {
            resolve(fileEntry);
          }, function(reason) {
            reject(reason);
          });
        })
        .catch((reason) => {
          reject(reason);
        });
    });
  },
  /**
   * If `auto` is set read the file when filename change.
   */
  _filenameChanged: function() {
    if (this.auto && this.filename) {
      this.readFile();
    }
  },
  /**
   * If `auto` is set write content to the file on content change.
   */
  _contentChanged: function() {
    if (this.auto && this.filename) {
      this.writeFile();
    }
  },
  /**
   * Read file content.
   * Result will be filled to `content` attribute.
   */
  read: function() {
    this.readFile();
  },
  /**
   * Write `this.content` to the file.
   * A `file-write` event will be fired when ready.
   */
  write: function() {
    this.writeFile();
  },
  /**
   * Write `this.content` to the file.
   */
  writeFile: function() {
    this.getFile()
      .then(this._truncate.bind(this))
      .then(() => this.getFile())
      .then(this._writeFileEntry.bind(this))
      .then(() => this.fire('file-write'))
      .catch((reason) => this.fire('error', reason));
  },
  /**
   * Read file contents.
   * This function will trigger "file-read" event with file contents.
   *
   * Example:
   *  <web-filesystem id="filesystem" file="names.json" on-file-read="{{onFileRead}}">
   *  </web-filesystem>
   *
   *  this.$.filesystem.readFile();
   *  //...
   *  onFileRead: function(event, details){
   *    //... details.content;
   *  }
   *
   * @returns {Promise} The promise with {FileEntry} object.
   */
  readFile: function() {
    this.getFile()
      .then(this._readFileContents)
      .then((result) => {
        var auto = this.auto;
        this.auto = false;
        this.content = result;
        this.async(() => {
          this.auto = auto;
        });
        this.fire('file-read', {
          content: result
        });
      })
      .catch((reason) => {
        this.fire('error', reason);
      });
  },
  /**
   * Read content of the file.
   *
   * @return {Promise} Fulfilled promise will result with file contents.
   */
  _readFileContents: function(fileEntry) {
    return new Promise((resolve, reject) => {
      fileEntry.file((file) => {
        var reader = new FileReader();
        reader.onloadend = function() {
          resolve(this.result);
        };
        reader.onerror = function(error) {
          reject(error);
        };
        reader.readAsText(file);
      }, (error) => {
        reject(error);
      });
    });
  },
  /**
   * Truncate the file.
   * Note that the file must be closed and re-opened to write to the file again.
   *
   * @return {Promise} Fulfilled promise when the file has been truncated.
   */
  _truncate: function(fileEntry) {
    return new Promise(function(resolve, reject) {
      fileEntry.createWriter(function(fileWriter) {
        fileWriter.onwriteend = function() {
          resolve();
        };
        fileWriter.onerror = function(e) {
          reject(e);
        };
        fileWriter.truncate(0);
      }, reject);
    });
  },
  /**
   * Write `this.content` to the file.
   *
   * @return {Promise} Fulfilled promise when the content has been written to the file.
   */
  _writeFileEntry: function(fileEntry) {
    return new Promise((resolve, reject) => {
      fileEntry.createWriter((fileWriter) => {
        fileWriter.onwriteend = function() {
          resolve(fileEntry);
        };
        fileWriter.onerror = function(e) {
          reject(e);
        };
        var toWrite;
        if (typeof this.content === 'string') {
          toWrite = [this.content];
        } else {
          toWrite = this.content;
        }
        var blob = new Blob(toWrite, {
          type: this.mime
        });
        fileWriter.write(blob);
      }, reject);
    });
  },
  /**
   * List files from root filesystem.
   * A `directory-read` event will be fired when the directory has been read.
   */
  list: function() {
    this._listImpl()
      .catch((reason) => {
        this.fire('error', reason);
      });
  },
  /**
   * Implementation of `list()` function without `catch` block so the syncable FS
   * can implement custom catch function.
   * TODO: add ability to read from any folder.
   *
   * @return {Promise} Fulfilled promise when ready.
   */
  _listImpl: function() {
    return this._requestFilesystem()
      .then(() => {
        let context = this;
        var entries = [];
        var dirReader = this.fileSystem.root.createReader();
        var readEntries = function() {
          dirReader.readEntries(function(results) {
            if (!results.length) {
              context.fire('directory-read', {
                files: entries.sort()
              });
            } else {
              entries = entries.concat(Array.from(results));
              readEntries();
            }
          }, function(reason) {
            context.fire('error', reason);
          });
        };
        readEntries();
      });
  },

  /**
   * Remove the file identified by the this.filename.
   * A `removed` event will be fired when the file has been deleted.
   */
  remove: function() {
    if (!this.filename || this.filename === '') {
      this.fire('error', new Error('Filename not present.'));
      return;
    }
    this.getFile()
      .then((fileEntry) => {
        fileEntry.remove(() => {
          this.fire('removed', {});
        }, (reason) => {
          this.fire('error', reason);
        });
      })
      .catch((reason) => {
        this.fire('error', reason);
      });
  }
};

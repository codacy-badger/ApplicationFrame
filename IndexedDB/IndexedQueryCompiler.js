import { Make } from '../util/make.js';
import ArrayUtil from '../util/array.js';

/**
 * A query object for an indexedDB request.
 */
const IndexedQuery = {
    /** @type {string} */
    name: '',

    /** @type {*} */
    rangeStart: null,

    /** @type {*} */
    rangeEnd: null,
};

/**
 * the query compiler for indexedDB requests.
 */
const IndexedQueryCompiler = {
    /**
     * @private
     * @type {IndexedQuery}
     */
    _currentQuery: null,

    /**
     * @private
     * @type {IndexedQuery[]}
     */
    _allQueries: null,

    /**
     * @private
     * @type {string}
     */
    _store: '',

    /**
     * @private
     * @type {Promise.<IDBDatabase>}
     */
    _db: null,

    sortOrder: 'next',

    /**
     * creates a new indexed query
     *
     * @param  {string} storeName the store to query
     * @param  {IDBDatabase} db   the db to query
     *
     * @return {undefined}
     */
    _make: function(storeName, db) {
        this._allQueries = [];
        this._store = storeName;
        this._db = db;
    },

    /**
     * @private
     *
     * @param  {*} value   [description]
     * @param  {boolean} exclude [description]
     *
     * @return {[type]}         [description]
     */
    _transformExclude: function(value, exclude) {
        if (Array.isArray(value)) {
            value = value.map(item => {
                return { value: item, exclude: exclude };
            });
        } else {
            value = { value: value, exclude: exclude };
        }

        return value;
    },

    /**
     * adds a where clause to the query.
     *
     * @param  {string} indexName the index to operate on
     *
     * @return {IndexedQueryCompiler}
     */
    where: function(indexName) {
        this._currentQuery = Make(IndexedQuery)();
        this._currentQuery.name = indexName;

        return this;
    },

    /**
     * filters items from the result if the index doesn't match the given value.
     *
     * @param  {*} value value to compare
     *
     * @return {IndexedQueryCompiler}
     */
    equals: function(value) {
        this.from(value).to(value);

        return this;
    },

    /**
     * starts a new value range
     *
     * @param  {*} value                 range start value
     * @param  {Boolean} [exclude=false] determines if the start value will be included in the range
     *
     * @return {IndexedQueryCompiler}
     */
    from: function(value, exclude=false) {
        value = this._transformExclude(value, exclude);

        if (Array.isArray(this._currentQuery.rangeStart)) {
            this._currentQuery.rangeStart = ArrayUtil.assignEmpty(this._currentQuery.rangeStart, value);
        } else {
            this._currentQuery.rangeStart = value;
        }

        return this;
    },

    /**
     * ends a value range
     *
     * @param  {*} value                 end value of the range
     * @param  {Boolean} [exclude=false] determines if the end value will be included in the range
     *
     * @return {IndexedQueryCompiler}
     */
    to: function(value, exclude=false) {
        value = this._transformExclude(value, exclude);

        if (Array.isArray(this._currentQuery.rangeEnd)) {
            this._currentQuery.rangeEnd = ArrayUtil.assignEmpty(this._currentQuery.rangeEnd, value);
        } else {
            this._currentQuery.rangeEnd = value;
        }

        return this;
    },

    /**
     * filters items from the result where the index is lower than the given value
     *
     * @param  {*} value
     *
     * @return {IndexedQueryCompiler}
     */
    lowerThan: function(value) {
        this.to(value, true);

        return this;
    },

    /**
     * filters items from the result where the index is higher than the given value
     *
     * @param  {*} value
     *
     * @return {IndexedQueryCompiler}
     */
    higherThan: function(value) {
        this.from(value, true);

        return this;
    },

    /**
     * starts an or clause to query an additional index
     *
     * @param  {string} indexName [description]
     *
     * @return {IndexedQueryCompiler}
     */
    or: function(indexName) {
        this._allQueries.push(this._currentQuery);
        this.where(indexName);

        return this;
    },

    /**
     * applies a sort order to the query results
     *
     * @param  {'ASC'|'DESC'} direction sort direction
     *
     * @return {IndexedDefinition}
     */
    sort: function(direction) {
        if (direction === 'ASC') {
            this.sortOrder = 'next';
        } else if (direction === 'DESC') {
            this.sortOrder = 'prev';
        }

        return this;
    },

    /**
     * assembles the results based on the composed query
     *
     * @param  {...number} limit one or two arguments which represent the start and end of the result range
     *
     * @return {Promise.<Array>}
     */
    get: function(...limit) {
        if (limit.length === 1) {
            limit.unshift(0);
        }

        this._allQueries.push(this._currentQuery);
        this._currentQuery = null;

        return this._execute(...limit);
    },

    /**
     * @private
     *
     * @param  {number} start start index
     * @param  {number} end   end index
     *
     * @return {Promise.<Array>}
     */
    _execute: function(start, end) {
        return this._db.then(db => {
            let matches = [];
            let results = [];

            const queries = this._allQueries.map(query => {
                return new Promise((done, error) => {
                    let store = db.transaction([this._store], 'readonly').objectStore(this._store);
                    let range = null;
                    let rangeArray = Array.isArray(query.rangeStart) || Array.isArray(query.rangeEnd);

                    if (!rangeArray) {
                        if (query.rangeStart && query.rangeEnd) {
                            range = IDBKeyRange.bound(query.rangeStart.value, query.rangeEnd.value,
                                query.rangeStart.exclude, query.rangeEnd.exclude);
                        } else if (query.rangeStart) {
                            range = IDBKeyRange.lowerBound(query.rangeStart.value, query.rangeStart.exclude);
                        } else {
                            range = IDBKeyRange.upperBound(query.rangeEnd.value, query.rangeEnd.exclude);
                        }
                    }

                    let request = store.index(query.name).openCursor(range, this.sortOrder);

                    request.onsuccess = ({ target: { result: cursor } }) => {
                        if (!cursor) {
                            return done();
                        }

                        if (matches.indexOf(JSON.stringify(cursor.primaryKey)) < 0) {
                            let doesMatch = true;
                            let keyCount = query.rangeStart && query.rangeStart.length ||
                                           query.rangeEnd && query.rangeEnd.length;

                            if (start > 0) {
                                start -= 1;
                                end -= 1;
                                return cursor.continue();
                            } else if (start === 0 && end > 0) {
                                end -= 1;
                            } else if (start === 0 && end === 0) {
                                return done();
                            }

                            if (rangeArray) {
                                for (let i = 0; i < keyCount; i++) {
                                    if (query.rangeStart && query.rangeStart[i].value !== null) {
                                        if (query.rangeStart[i].exclude) {
                                            doesMatch = doesMatch && cursor.key[i] > query.rangeStart[i].value;
                                        } else {
                                            doesMatch = doesMatch && cursor.key[i] >= query.rangeStart[i].value;
                                        }
                                    }

                                    if (query.rangeEnd && query.rangeEnd[i].value !== null) {
                                        if (query.rangeEnd.exclude) {
                                            doesMatch = doesMatch && cursor.key[i] < query.rangeEnd[i].value;
                                        } else {
                                            doesMatch = doesMatch && cursor.key[i] <= query.rangeEnd[i].value;
                                        }
                                    }
                                }
                            }

                            if (doesMatch) {
                                results.push(cursor.value);
                                matches.push(JSON.stringify(cursor.primaryKey));
                            }
                        }

                        return cursor.continue();
                    };

                    request.onerror = error;
                });
            });

            return Promise.all(queries).then(() => results);
        });
    }
};

export default IndexedQueryCompiler;

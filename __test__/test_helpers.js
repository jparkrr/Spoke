import _ from 'lodash'
import { createLoaders, createTables, dropTables } from '../src/server/models/'

export async function setupTest() {
  await createTables()
  return
}

export async function cleanupTest() {
  await dropTables()
}

export function getContext(context) {
  return {
    ...context,
    req: {},
    loaders: createLoaders()
  }
}
import loadData from '../src/containers/hoc/load-data'
jest.mock('../src/containers/hoc/load-data')

/* Used to get graphql queries from components.
*  Because of some limitations with the jest require cache that
*  I can't find a way of getting around, it should only be called once
*  per test.

*  The query it returns should be that of the requested component, but
*  the mutations should be merged from the component and its children.
*/
export function getGql(componentPath, props) {
  require(componentPath) // eslint-disable-line

  const { mapQueriesToProps } = _.last(loadData.mock.calls)[1]

  const mutations = loadData.mock.calls.reduce((acc, mapping) => {
    if (!mapping[1].mapMutationsToProps) return acc
    return {
      ...acc,
      ..._.mapValues(
        mapping[1].mapMutationsToProps({ ownProps: props }),
        mutation => (...params) => {
          const m = mutation(...params)
          return [m.mutation.loc.source.body, m.variables]
        }
      )
    }
  }, {})

  let query
  if (mapQueriesToProps) {
    const data = mapQueriesToProps({ ownProps: props }).data
    query = [data.query.loc.source.body, data.variables]
  }

  return { query, mutations }
}

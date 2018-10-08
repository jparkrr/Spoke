/* eslint-disable no-unused-expressions, consistent-return */
import { resolvers } from '../src/server/api/schema'
import { schema } from '../src/api/schema'
import { graphql } from 'graphql'
import { User, CampaignContact, Message, r } from '../src/server/models/'
import { getContext, setupTest, cleanupTest, getGql } from './test_helpers'
import { makeExecutableSchema } from 'graphql-tools'
import waitForExpect from 'wait-for-expect'

const mySchema = makeExecutableSchema({
  typeDefs: schema,
  resolvers,
  allowUndefinedInResolve: true
})

const rootValue = {}

let testAdminUser
let testInvite
let testOrganization
let testCampaign
let testTexterUser
let testContact

async function createUser(
  userInfo = {
    auth0_id: 'test123',
    first_name: 'TestUserFirst',
    last_name: 'TestUserLast',
    cell: '555-555-5555',
    email: 'testuser@example.com'
  }
) {
  const user = new User(userInfo)
  await user.save()
  return user
}

async function createContact() {
  const campaignId = testCampaign.data.createCampaign.id

  const contact = new CampaignContact({
    first_name: 'Ann',
    last_name: 'Lewis',
    cell: '5555555555',
    zip: '12345',
    campaign_id: campaignId
  })
  await contact.save()
  return contact
}

async function createInvite() {
  const inviteQuery = `mutation {
    createInvite(invite: {is_valid: true}) {
      id
    }
  }`
  const context = getContext()
  return await graphql(mySchema, inviteQuery, rootValue, context)
}

async function createOrganization() {
  const user = testAdminUser
  const name = 'Testy test organization'
  const userId = user.id
  const inviteId = testInvite.data.createInvite.id

  const context = getContext({ user })

  const orgQuery = `mutation createOrganization($name: String!, $userId: String!, $inviteId: String!) {
    createOrganization(name: $name, userId: $userId, inviteId: $inviteId) {
      id
      uuid
    }
  }`

  const variables = {
    userId,
    name,
    inviteId
  }
  return await graphql(mySchema, orgQuery, rootValue, context, variables)
}

async function createCampaign() {
  const user = testAdminUser
  const title = 'test campaign'
  const description = 'test description'
  const organizationId = testOrganization.data.createOrganization.id
  const contacts = []
  const context = getContext({ user })

  const campaignQuery = `mutation createCampaign($input: CampaignInput!) {
    createCampaign(campaign: $input) {
      id
    }
  }`
  const variables = {
    input: {
      title,
      description,
      organizationId,
      contacts
    }
  }
  return await graphql(mySchema, campaignQuery, rootValue, context, variables)
}

async function createTexter() {
  const user = await createUser({
    auth0_id: 'test456',
    first_name: 'TestTexterFirst',
    last_name: 'TestTexterLast',
    cell: '555-555-6666',
    email: 'testtexter@example.com'
  })
  const joinQuery = `
  mutation joinOrganization($organizationUuid: String!) {
    joinOrganization(organizationUuid: $organizationUuid) {
      id
    }
  }`
  const variables = {
    organizationUuid: testOrganization.data.createOrganization.uuid
  }
  const context = getContext({ user })
  await graphql(mySchema, joinQuery, rootValue, context, variables)
  return user
}

async function assignTexter() {
  const campaignEditQuery = `
  mutation editCampaign($campaignId: String!, $campaign: CampaignInput!) {
    editCampaign(id: $campaignId, campaign: $campaign) {
      id
    }
  }`
  const context = getContext({ user: testAdminUser })
  const updateCampaign = Object.assign({}, testCampaign.data.createCampaign)
  const campaignId = updateCampaign.id
  updateCampaign.texters = [
    {
      id: testTexterUser.id
    }
  ]
  delete updateCampaign.id
  delete updateCampaign.contacts
  const variables = {
    campaignId,
    campaign: updateCampaign
  }
  return await graphql(mySchema, campaignEditQuery, rootValue, context, variables)
}

async function createScript() {
  const campaignEditQuery = `
  mutation editCampaign($campaignId: String!, $campaign: CampaignInput!) {
    editCampaign(id: $campaignId, campaign: $campaign) {
      id
    }
  }`
  const context = getContext({ user: testAdminUser })
  const campaignId = testCampaign.data.createCampaign.id
  const variables = {
    campaignId,
    campaign: {
      interactionSteps: {
        id: '1',
        questionText: 'Test',
        script: '{zip}',
        answerOption: '',
        answerActions: '',
        parentInteractionId: null,
        isDeleted: false,
        interactionSteps: [
          {
            id: '2',
            questionText: 'hmm',
            script: '{lastName}',
            answerOption: 'hmm',
            answerActions: '',
            parentInteractionId: '1',
            isDeleted: false,
            interactionSteps: []
          }
        ]
      }
    }
  }
  return await graphql(mySchema, campaignEditQuery, rootValue, context, variables)
}

jest.mock('../src/server/mail')
async function startCampaign() {
  const startCampaignQuery = `mutation startCampaign($campaignId: String!) {
    startCampaign(id: $campaignId) {
      id
    }
  }`
  const context = getContext({ user: testAdminUser })
  const variables = { campaignId: testCampaign.data.createCampaign.id }
  return await graphql(mySchema, startCampaignQuery, rootValue, context, variables)
}

beforeEach(async () => {
  await cleanupTest()
  r.redis.flushdb()
  await setupTest()
  testAdminUser = await createUser()

  testInvite = await createInvite()

  testOrganization = await createOrganization()

  testCampaign = await createCampaign()

  testContact = await createContact()

  testTexterUser = await createTexter()

  await assignTexter()
  await createScript()
  // await createResponse()
  await startCampaign()
}, global.DATABASE_SETUP_TEARDOWN_TIMEOUT)

afterEach(async () => {
  // await cleanupTest()
  // r.redis.flushdb()
}, global.DATABASE_SETUP_TEARDOWN_TIMEOUT)

it('should send an inital message to test contacts', async () => {
  const assignmentId = 1 // TODO: don't hardcode this

  const { query: [getContacts, getContactsVars], mutations } = getGql('../src/containers/TexterTodo', {
    messageStatus: 'needsMessage',
    params: { assignmentId }
  })

  const context = getContext({ user: testTexterUser })
  const contactsResult = await graphql(mySchema, getContacts, rootValue, context, getContactsVars)

  const [getAssignmentContacts, assignVars] = mutations.getAssignmentContacts(
    contactsResult.data.assignment.contacts.map(e => e.id),
    false
  )

  const ret2 = await graphql(mySchema, getAssignmentContacts, rootValue, context, assignVars)
  const contact = ret2.data.getAssignmentContacts[0]

  const message = {
    contactNumber: contact.cell,
    userId: testTexterUser.id,
    text: 'test text',
    assignmentId
  }

  const [messageMutation, messageVars] = mutations.sendMessage(message, contact.id)

  const messageResult = await graphql(mySchema, messageMutation, rootValue, context, messageVars)
  const campaignContact = messageResult.data.sendMessage

  // These things are expected to be returned from the sendMessage mutation
  expect(campaignContact.messageStatus).toBe('messaged')
  expect(campaignContact.messages.length).toBe(1)
  expect(campaignContact.messages[0].text).toBe(message.text)


  const expectedDbMessage = {
    user_id: testTexterUser.id,
    contact_number: testContact.cell,
    text: message.text,
    assignment_id: assignmentId,
    campaign_contact_id: testContact.id
  }

  // wait for fakeservice to mark the message as sent
  await waitForExpect(async () => {
    const dbMessage = await r.knex('message')
    expect(dbMessage.length).toEqual(2)
    expect(dbMessage[0]).toEqual(expect.objectContaining({
      send_status: 'SENDING',
      ...expectedDbMessage
    }))
    expect(dbMessage[1]).toEqual(expect.objectContaining({
      send_status: 'SENT',
      ...expectedDbMessage
    }))
  })

  const dbCampaignContact = await r.knex('campaign_contact').first()
  expect(dbCampaignContact.message_status).toBe('messaged')

  // Refetch the contacts via gql to check the caching
  context.loaders.campaignContact.clear('1') // TODO: figure ouy why I need this
  const ret3 = await graphql(mySchema, getAssignmentContacts, rootValue, context, assignVars)
  expect(ret3.data.getAssignmentContacts[0].messageStatus).toEqual('messaged')
})

// TODO: Another test where we check do autorespond and check needsReponse
// TODO: And then we reply to it and make sure that works

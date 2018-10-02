/* eslint-disable no-unused-expressions, consistent-return */
import { resolvers } from '../src/server/api/schema'
import { schema } from '../src/api/schema'
import { graphql } from 'graphql'
import { User, CampaignContact } from '../src/server/models/'
import { getContext, setupTest, cleanupTest, getGql } from './test_helpers'
import { makeExecutableSchema } from 'graphql-tools'

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
let testContact // eslint-disable-line

// data creation functions

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
  try {
    await user.save()
    console.log('created user')
    console.log(user)
    return user
  } catch (err) {
    console.error('Error saving user')
    return false
  }
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
  try {
    await contact.save()
    console.log('created contact')
    console.log(contact)
    return contact
  } catch (err) {
    console.error('Error saving contact: ', err)
    return false
  }
}

async function createInvite() {
  const inviteQuery = `mutation {
    createInvite(invite: {is_valid: true}) {
      id
    }
  }`
  const context = getContext()
  try {
    const invite = await graphql(mySchema, inviteQuery, rootValue, context)
    return invite
  } catch (err) {
    console.error('Error creating invite')
    return false
  }
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
      name
      threeClickEnabled
      textingHoursEnforced
      textingHoursStart
      textingHoursEnd
    }
  }`

  const variables = {
    userId,
    name,
    inviteId
  }

  try {
    const org = await graphql(mySchema, orgQuery, rootValue, context, variables)
    return org
  } catch (err) {
    console.error('Error creating organization')
    return false
  }
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
      title
      contacts {
        firstName
        lastName
      }
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

  try {
    const campaign = await graphql(mySchema, campaignQuery, rootValue, context, variables)
    return campaign
  } catch (err) {
    console.error('Error creating campaign')
    return false
  }
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
      title
      description
      dueBy
      isStarted
      isArchived
      contactsCount
      datawarehouseAvailable
      customFields
      texters {
        id
        firstName
        assignment(campaignId:$campaignId) {
          contactsCount
          needsMessageCount: contactsCount(contactsFilter:{messageStatus:\"needsMessage\"})
        }
      }
      interactionSteps {
        id
        questionText
        script
        answerOption
        answerActions
        parentInteractionId
        isDeleted
      }
      cannedResponses {
        id
        title
        text
      }
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
            interactionSteps: [
            ]
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
  // TODO: clear cache
  await setupTest()
  testAdminUser = await createUser()

  testInvite = await createInvite()

  testOrganization = await createOrganization()

  testCampaign = await createCampaign()

  testContact = await createContact()

  testTexterUser = await createTexter()
  // TODO: Move creation to lib.

  await assignTexter()
  await createScript()
  // await createResponse()
  await startCampaign()
}, global.DATABASE_SETUP_TEARDOWN_TIMEOUT)

// afterEach(async () => await cleanupTest(), global.DATABASE_SETUP_TEARDOWN_TIMEOUT)

it('should send an inital message to test contacts', async() => {
  const assignmentId = 1

  const { query, mutations } = getGql('../src/containers/TexterTodo', { messageStatus: 'needsMessage', params: { assignmentId } })

  const context = getContext({ user: testTexterUser })
  const ret = await graphql(mySchema, query[0], rootValue, context, query[1])

  const [mutationAssign, varsAssign] = mutations.getAssignmentContacts(ret.data.assignment.contacts.map(e => e.id), false)

  const ret2 = await graphql(mySchema, mutationAssign, rootValue, context, varsAssign)
  const contact = ret2.data.getAssignmentContacts[0]

  const message = {
    contactNumber: contact.cell,
    userId: testTexterUser.id,
    text: 'test text autorespond',
    assignmentId
  }

  const [messageMutation, messageVars] = mutations.sendMessage(message, contact.id)


  const ret3 = await graphql(mySchema, messageMutation, rootValue, context, messageVars)
  // await this.props.mutations.sendMessage(message, contact.id)
  // await this.handleSubmitSurveys()
  // this.props.onFinishContact(contact.id)
  console.log(ret3.data.sendMessage.messages) // TODO: check response
  // TODO: check the db
})

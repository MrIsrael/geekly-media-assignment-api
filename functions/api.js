//  Define execution environment (localhost or Netlify), to determine origin of environment variables (".env" file or Netlify UI)
if (!process.env.NETLIFY) { require('dotenv').config() }

if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL)
  throw new Error('no GOOGLE_SERVICE_ACCOUNT_EMAIL env var set')
if (!process.env.GOOGLE_PRIVATE_KEY)
  throw new Error('no GOOGLE_PRIVATE_KEY env var set')
if (!process.env.GOOGLE_SPREADSHEET_ID_FROM_URL)
  throw new Error('no GOOGLE_SPREADSHEET_ID_FROM_URL env var set')

const { GoogleSpreadsheet } = require('google-spreadsheet')

// All http methods are evaluated through this unique async handler function
exports.handler = async (event, context) => {
  const doc = new GoogleSpreadsheet(process.env.GOOGLE_SPREADSHEET_ID_FROM_URL)

  // Google Cloud Platform authentication ("Service Account Auth" method)
  await doc.useServiceAccountAuth({
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
  })
  // Load document properties and sheets it contains (required)
  await doc.loadInfo()

  const path = event.path.replace('/.netlify/functions/api/', '')
  const pathSegments = path.split('/')
  
  try {

    switch (event.httpMethod) {
      case 'GET':
        switch (pathSegments[0]) {
          // Get info from all sheets included on document: How many are there, their names and qty of entries each one contains
          // Endpoint: GET /.netlify/functions/api/get-doc-info
          case 'get-doc-info':
            let temp = []
            doc.sheetsByIndex.forEach((sheet, index) => {
              temp.push({ 'Sheet Index': index, 'Sheet name': sheet.title, 'Rows on it': sheet.rowCount })
            })
            return {
              statusCode: 200,
              headers: {                                                      // CORS issue fixed on localhost and Netlify
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Authorization, X-API-KEY, Origin, X-Requested-With, Content-Type, Accept, Access-Control-Allow-Request-Method',
                'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS, PUT, DELETE',
                'Allow': 'GET, POST, PATCH, OPTIONS, PUT, DELETE'
              },
              body: JSON.stringify({
                googleSheetId: doc.spreadsheetId,                             // string
                numberOfSheetsDocumentContains: doc.sheetCount,               // int
                sheetsInfo: temp                                              // array of objects
              })
            }
            
          // Get all rows from a sheet, including headers, and existing number of entries on it
          case 'get-rows':
            // Endpoint: GET /.netlify/functions/api/get-rows/1               --> Get all rows from sheet with index = 1
            if (pathSegments.length === 2) {
              const sheetNum = parseInt(pathSegments[1])
              const rows = await doc.sheetsByIndex[sheetNum].getRows()                          // can pass in { limit, offset }
              const serializedRows = rows.map((row) => serializeRow(sheetNum, row))
              const headerNames = Object.keys(serializedRows[0])
              return {
                statusCode: 200,
                headers: {
                  'Access-Control-Allow-Origin': '*',
                  'Access-Control-Allow-Headers': 'Authorization, X-API-KEY, Origin, X-Requested-With, Content-Type, Accept, Access-Control-Allow-Request-Method',
                  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS, PUT, DELETE',
                  'Allow': 'GET, POST, PATCH, OPTIONS, PUT, DELETE'
                },
                body: JSON.stringify({
                  numberOfRowsContainingData: serializedRows.length,                            // int
                  numberOfColumnsContainingData: headerNames.length,                            // int
                  headers: headerNames,                                                         // array of strings
                  rowsData: serializedRows                                                      // array of objects
                })
              }
            }

            // Endpoint: GET /.netlify/functions/api/get-rows/1/25            --> Get data from row with id = 25, on sheet with index = 1
            if (pathSegments.length === 3) {
              const sheetNum = parseInt(pathSegments[1])
              const givenId = parseInt(pathSegments[2])
              const rows = await doc.sheetsByIndex[sheetNum].getRows()
              const rowId = findByRowId(sheetNum, rows, givenId)
              const srow = serializeRow(sheetNum, rows[rowId])
              return {
                statusCode: 200,
                headers: {
                  'Access-Control-Allow-Origin': '*',
                  'Access-Control-Allow-Headers': 'Authorization, X-API-KEY, Origin, X-Requested-With, Content-Type, Accept, Access-Control-Allow-Request-Method',
                  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS, PUT, DELETE',
                  'Allow': 'GET, POST, PATCH, OPTIONS, PUT, DELETE'
                },
                body: JSON.stringify({
                  zeroIndexRowNumber: rowId,                                                    // int
                  rowData: srow                                                                 // object
                })
              }
            }
            
          // Find row number (zero index enumeration) of given entry, based on sheet index and id received on endpoint
          case 'find-row-by-id':
            // Endpoint: GET /.netlify/functions/api/find-row-by-id/1/15  --> Get row number for entry with id = 15, on sheet with index = 1
            if (pathSegments.length === 3) {
              const sheetNum = parseInt(pathSegments[1])
              const givenId = parseInt(pathSegments[2])
              const rows = await doc.sheetsByIndex[sheetNum].getRows()
              const rowId = findByRowId(sheetNum, rows, givenId)
              return {
                statusCode: 200,
                headers: {
                  'Access-Control-Allow-Origin': '*',
                  'Access-Control-Allow-Headers': 'Authorization, X-API-KEY, Origin, X-Requested-With, Content-Type, Accept, Access-Control-Allow-Request-Method',
                  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS, PUT, DELETE',
                  'Allow': 'GET, POST, PATCH, OPTIONS, PUT, DELETE'
                },
                body: JSON.stringify({
                  zeroIndexRowNumber: rowId,                                                    // int
                  providedId: givenId                                                           // int
                })
              }
            }

          // Find row number (zero index enumeration) of given entry, based on sheet index, column name and value received on endpoint
          case 'find-row-by-column-name-and-value':
            // Endpoint: GET /.netlify/functions/api/find-row-by-column-name-and-value/2/id/10184268
            // --> Get row number for entry with id = 10184268, on sheet with index = 2
            if (pathSegments.length === 4) {
              const sheetNum = parseInt(pathSegments[1])
              const columnName = pathSegments[2].toString().replace(/%20/g, ' ').toLowerCase().trim()
              const targetValue = pathSegments[3].toString().replace(/%20/g, ' ').toLowerCase().trim()
              // console.log(columnName)
              // console.log(targetValue)
              const rows = await doc.sheetsByIndex[sheetNum].getRows()
              const rowId = await findRowByColumnAndValuePair(sheetNum, rows, columnName, targetValue)
              const srow = rowId === -1 ? {} : serializeRow(sheetNum, rows[rowId])
              return {
                statusCode: 200,
                headers: {
                  'Access-Control-Allow-Origin': '*',
                  'Access-Control-Allow-Headers': 'Authorization, X-API-KEY, Origin, X-Requested-With, Content-Type, Accept, Access-Control-Allow-Request-Method',
                  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS, PUT, DELETE',
                  'Allow': 'GET, POST, PATCH, OPTIONS, PUT, DELETE'
                },
                body: JSON.stringify({
                  zeroIndexRowNumber: rowId,                                                    // int
                  rowData: srow,                                                                // object
                  providedColumnName: columnName,                                               // string
                  providedValue: targetValue                                                    // string
                })
              }
            }
              
          default:
            return {
              statusCode: 500,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Authorization, X-API-KEY, Origin, X-Requested-With, Content-Type, Accept, Access-Control-Allow-Request-Method',
                'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS, PUT, DELETE',
                'Allow': 'GET, POST, PATCH, OPTIONS, PUT, DELETE'
              },
              body: 'Invalid GET request... Check URL string after: /.netlify/functions/api/'
            }
        }
              
      // Add new row with data, after last existing one, pointing to proper sheet index
      // Endpoint: POST /.netlify/functions/api/1       --> Add row to sheet with index = 1, sending a JSON as body
      case 'POST':
        if (pathSegments.length !== 1) {
          console.error('POST request must contain only 1 parameter (sheetId)')
          return {
            statusCode: 422,                                                                        // unprocessable entity
            headers: {
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Headers': 'Authorization, X-API-KEY, Origin, X-Requested-With, Content-Type, Accept, Access-Control-Allow-Request-Method',
              'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS, PUT, DELETE',
              'Allow': 'GET, POST, PATCH, OPTIONS, PUT, DELETE'
            },
            body: 'POST request must contain only 1 parameter (sheetId)'
          }
        } else {
          const sheetNum = parseInt(pathSegments[0])
          const rows = await doc.sheetsByIndex[sheetNum].getRows()                                  // can pass in { limit, offset }  
          const serializedRows = rows.map((row) => serializeRow(sheetNum, row))
          const rowsDataToArray = serializedRows.map(obj => Object.entries(obj))
          const idLastRow = rowsDataToArray.length > 0 ? parseInt(rowsDataToArray[rows.length - 1][0][1]) : 0
          let stringData = (event.body).toString()
          stringData = stringData.slice(1)
          stringData = '{"id":"'.concat((idLastRow + 1).toString()).concat('",').concat(stringData)
          const data = JSON.parse(stringData)                                                       // parse the string body into a useable JS object
          await doc.sheetsByIndex[sheetNum].addRow(data)
          return {
            statusCode: 200,
            headers: {
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Headers': 'Authorization, X-API-KEY, Origin, X-Requested-With, Content-Type, Accept, Access-Control-Allow-Request-Method',
              'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS, PUT, DELETE',
              'Allow': 'GET, POST, PATCH, OPTIONS, PUT, DELETE'
            },
            body: JSON.stringify({
              message: `POST Success! - Added row with id # on array (zero index) ${idLastRow + 1} on sheet named: ${doc.sheetsByIndex[sheetNum].title}`,
              newId: idLastRow + 1,
              addedData: data
            })
          }
        }

      // Modify data from a given id, pointing to proper sheet within the document
      // Endpoint: PATCH /.netlify/functions/api/0/23    --> Modify values from row with id = 23, from sheet with index = 0,
      // sending a JSON with the columns to be overwritten
      case 'PATCH':
        if (pathSegments.length !== 2) {
          console.error('PATCH request must contain 2 parameters (sheetId, rowIdToPatch)')
          return {
            statusCode: 422,                                                                      // unprocessable entity
            headers: {
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Headers': 'Authorization, X-API-KEY, Origin, X-Requested-With, Content-Type, Accept, Access-Control-Allow-Request-Method',
              'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS, PUT, DELETE',
              'Allow': 'GET, POST, PATCH, OPTIONS, PUT, DELETE'
            },
            body: 'PATCH request must contain 2 parameters (sheetId, rowIdToPatch)'
          }
        } else {
          const sheetNum = parseInt(pathSegments[0])
          const givenId = parseInt(pathSegments[1])
          const rows = await doc.sheetsByIndex[sheetNum].getRows()
          const rowId = findByRowId(sheetNum, rows, givenId)
          const data = JSON.parse(event.body)
          const selectedRow = rows[rowId]
          Object.entries(data).forEach(([k, v]) => {
            selectedRow[k] = v
          })
          await selectedRow.save()
          return {
            statusCode: 200,
            headers: {
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Headers': 'Authorization, X-API-KEY, Origin, X-Requested-With, Content-Type, Accept, Access-Control-Allow-Request-Method',
              'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS, PUT, DELETE',
              'Allow': 'GET, POST, PATCH, OPTIONS, PUT, DELETE'
            },
            body: JSON.stringify({ 
              message: `Row # ${rowId} with id # ${givenId} on sheet named: --${doc.sheetsByIndex[sheetNum].title}-- sucessfully PATCHED!`,
              patchedData: data
            })
          }
        }
      
      // Delete row, based on Google Sheets' own row enumeration
      // Endpoint: DELETE /.netlify/functions/api/5/12    --> Delete row with id = 12 from sheet with index = 5
      case 'DELETE':
        if (pathSegments.length !== 2) {
          console.error('Invalid DELETE request... Check URL string after: /.netlify/functions/api/')
          return {
            statusCode: 500,
            headers: {
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Headers': 'Authorization, X-API-KEY, Origin, X-Requested-With, Content-Type, Accept, Access-Control-Allow-Request-Method',
              'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS, PUT, DELETE',
              'Allow': 'GET, POST, PATCH, OPTIONS, PUT, DELETE'
            },
            body: JSON.stringify({
              message: 'Invalid DELETE request... Check URL string after: /.netlify/functions/api/'
            })
          }
        } else {
          const sheetNum = parseInt(pathSegments[0])
          const givenId = parseInt(pathSegments[1])
          const rows = await doc.sheetsByIndex[sheetNum].getRows()
          const rowId = findByRowId(sheetNum, rows, givenId)
          const selectedRow = rows[rowId]
          await selectedRow.delete()
          return {
            statusCode: 200,
            headers: {
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Headers': 'Authorization, X-API-KEY, Origin, X-Requested-With, Content-Type, Accept, Access-Control-Allow-Request-Method',
              'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS, PUT, DELETE',
              'Allow': 'GET, POST, PATCH, OPTIONS, PUT, DELETE'
            },
            body: JSON.stringify({ 
              message: `Row # ${rowId} with id # ${givenId} on sheet named: --${doc.sheetsByIndex[sheetNum].title}-- sucessfully DELETED!`
            })
          }
        }

      // Response to preflight request from browser, sent just before any PUT, POST, PATCH, or DELETE request
      case 'OPTIONS':
        return {
          statusCode: 200,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Authorization, X-API-KEY, Origin, X-Requested-With, Content-Type, Accept, Access-Control-Allow-Request-Method',
            'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS, PUT, DELETE',
            'Allow': 'GET, POST, PATCH, OPTIONS, PUT, DELETE'
          },
          body: JSON.stringify({
            message: 'OPTIONS request returned with "HTTP ok" status'
          })
        }

      default:
        return {
          statusCode: 500,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Authorization, X-API-KEY, Origin, X-Requested-With, Content-Type, Accept, Access-Control-Allow-Request-Method',
            'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS, PUT, DELETE',
            'Allow': 'GET, POST, PATCH, OPTIONS, PUT, DELETE'
          },
          body: 'Unrecognized HTTP method... Must be one of the following: GET/POST/PATCH/DELETE'
        }
    }
    
  } catch (err) {
    console.error('Error ocurred in processing...', event)
    console.error(err)
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Authorization, X-API-KEY, Origin, X-Requested-With, Content-Type, Accept, Access-Control-Allow-Request-Method',
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS, PUT, DELETE',
        'Allow': 'GET, POST, PATCH, OPTIONS, PUT, DELETE'
      },
      body: err.toString()
    }
  }

  // Utilities
  function serializeRow(sheetNum, row) {
    let temp = {}
    doc.sheetsByIndex[sheetNum].headerValues.map((header) => {
      temp[header] = row[header]
    })
    return temp
  }

  function findByRowId(sheetNum, rows, givenId) {
    const serializedRows = rows.map((row) => serializeRow(sheetNum, row))
    const rowsDataToArray = serializedRows.map(obj => Object.entries(obj))
    const rowId = rowsDataToArray.findIndex(reg => {
      return parseInt(reg[0][1]) === givenId
    })
    return rowId
  }

  function findRowByColumnAndValuePair(sheetNum, rows, columnName, targetValue) {
    const serializedRows = rows.map((row) => serializeRow(sheetNum, row))
    const rowsDataToArray = serializedRows.map(obj => Object.entries(obj))
    const columnIndex = rowsDataToArray[0].findIndex(pair => {
      return pair[0].toLowerCase().trim() === columnName
    })
    const rowId = rowsDataToArray.findIndex(reg => {
      if (reg[columnIndex][1] !== '' && reg[columnIndex][1] !== undefined && reg[columnIndex][1] !== null) {
        return reg[columnIndex][1].toString().toLowerCase().trim() === targetValue
      }
    })
    console.log('rowId = ' + rowId)
    return rowId                                                                        // rowId = -1 if there's no match
  } 

}

import * as AWS from 'aws-sdk';

AWS.config.update({
  region: 'us-east-1'
});

export const getParam = async  (name: string) => {
  const parameterStore = new AWS.SSM();

  console.info(`pegando parametro ${name}`);
  
  const result = await parameterStore.getParameter({
    Name: name
  }).promise();

  
  
  return result.Parameter?.Value;
}


const Main = async () => {
  //Para testar se está conseguindo pegar os valore no parameterStore
  const param = await getParam('/prod/wb-service/APP_PORT');
  console.info(param);

}

// Main();
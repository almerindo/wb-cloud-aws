# wb-cloud-aws
Este projeto utiliza o aws-cdk para criar a estrutura de infra básicca na AWS para a Whitebeard.

# SETUP
Você precisa instalar o aws-cli na sua máquina e configurar as credenciais.

Após instalar o aws cli, entre em `cd ~/.aws` e siga as instruções:

- [ ]: Configurar o arquivo `~/.aws/config` adicionando a seção `[whitebeard]`

```
[whitebeard]
region = us-east-1
output = json
```
- [ ]: Configurar o arquivo `~/.aws/credentials` adicionando a seção `[whitebeard]` con as suas ccredenciais da AWS:

```
[whitebeard]
aws_access_key_id = SUA_AWS_ACCESS_KEY_ID
aws_secret_access_key = SUA_AWS_SECRET_ACCESS_KEY
```
## Configurando as variáveis de ambiente
crie os parameter store na AWS necessários para rodar o projeto com seus respectivos valores. Exemplo:
```
/prod/wb-service/APP_PORT = 3000	
/prod/wb-service/CPU_LIMIT = 512	
/prod/wb-service/MEMORY_LIMIT = 2048
/prod/wb-service/DESIRED_COUNT	= 2

/prod/wb-service/DATABASE_URI	= mongodb+srv://<USER>:<PASS>@wb.mongodb.net/whitebeardDatabase
```

infra-base

## Instalando os pacotes necessários:
- [ ]: Entre no diretório raiz do projeto `cd  wb-cloud-aws` e digite `yarn`

- [ ]: Entre no diretório do projeto da infra básica aws `cd  wb-cloud-aws/aws` e digite `yarn`

> Pronto! Agora volte para a raiz inicial do projeto e digite: `yarn stack:production:deploy` para criar toda a infra na AWS.

> Caso necessite remover tudo que foi criado, `CUIDADO QUE PODE DERRUBAR TODA  A INFRA!` Digite: `yarn stack:production:destroy`

## Scripts
```
"init:app": "cd aws; cdk init app --language=typescript",
"stack:production:diff": "cd aws; cdk --profile whitebeard diff WhiteBeardStack",
"stack:production:deploy": "cd aws; cdk --profile whitebeard deploy WhiteBeardStack",
"stack:production:destroy": "cd aws; cdk --profile whitebeard destroy WhiteBeardStack",
"stack:production:app:bootstrap:template": "cd aws; cdk --profile whitebeard bootstrap --show-template",
"stack:production:app:bootstrap": "cd aws; cdk --profile whitebeard bootstrap"
```

## Requisitos para destruir toda a infra-estrutura
- [ ]: Primeiro verifique se todas as imagens do ECR foram apagadas. Não será destruído o Repositório se existir imagens de containers dentro.
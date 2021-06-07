import {EStep, proccessInfra} from './aws'

import { parse } from 'ts-command-line-args';
interface ICreatesInfraArgs {
  build_cluster_vpc: boolean;
  build_ecr_service: boolean;
  build_ecs_fargate_service: boolean;
  build_redis_elastic_cache: boolean;
  
  help?: boolean;
}

const getCode = (args: ICreatesInfraArgs) =>{

  let code = -1;
  
  if (args.build_cluster_vpc) {
    code = EStep['STEP0 - BUILD_INITIAL_INFRA'];
  };

  if (args.build_ecr_service) {
    code = EStep['STEP1 - BUILD_ECR_SERVICE'];
  };

  if (args.build_ecs_fargate_service) {
    code = EStep['STEP2 - BUILD_ECS_FARGATE_SERVICES'];
  };

  if (args.build_redis_elastic_cache) {
    code = EStep['STEP OPTIONAL - BUILD_REDIS_ELASTIC_CACHE'];
  };

  return code;
}

const Main = async () =>{
  const args = parse<ICreatesInfraArgs>(
    {
        build_cluster_vpc: {type: Boolean, description: 'Creates initial infra with a Cluster and VPC' },
        build_ecr_service: {type: Boolean,  description: 'Creates a ECR service on Cluster and VPC' },
        build_ecs_fargate_service: {type: Boolean,  description: 'Creates a ECS Application LoadBalanced service on Cluster and VPC. This service depends on the ECR service' },
        build_redis_elastic_cache: {type: Boolean,  description: 'Add a elasticcache service in the cluster and vpc' },   
        help: { type: Boolean, optional: true, alias: 'h', description: 'Prints this usage guide' },
    },
    {
        helpArg: 'help',
        headerContentSections: [{ header: 'Whitebeard Technology', content: 'Thanks for using Our Awesome services' }],
        footerContentSections: [{ header: 'Footer', content: `Copyright: Whitebeard.dev Corp. inc.` }],
    },
  );
  
  console.info('Conf -> ',JSON.stringify(args));
  await proccessInfra(getCode(args));
  
}

Main();